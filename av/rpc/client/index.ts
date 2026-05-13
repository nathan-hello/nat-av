import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { System } from "@av/system";

import { isRPCError, isRPCNotification, isRPCResponse } from "@av/rpc/utils";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { PendingRequest, RpcEvents, SystemStateData } from "@av/rpc/client/types";
import { ClientRpcDevice } from "@av/rpc/client/devices";

export class ClientRpc<N extends Natav = natav> extends TypedEventTarget<RpcEvents> {
  private transport: ClientWebsocket;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private deviceStates: Partial<Record<string, unknown>> = {};
  private systemStateData: SystemStateData = { connections: {} };
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();
  private initialized = false;

  constructor() {
    super();
    this.transport = new ClientWebsocket("/ws", {
      reconnect: true,
      retryDelay: 1000,
    });

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.initialized = false;
      super.dispatch("close", event);
      for (let handle of this.deviceHandles.values()) {
        handle.notify();
      }
    });

    this.transport.on("error", (event) => {
      super.dispatch("error", event);
    });

    this.transport.on("message", (event) => {
      this.onMessage(event.data);
    });
  }

  connect() {
    this.transport.connect();
    return this;
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
    return this;
  }

  get readyState() {
    return this.transport.readyState;
  }

  private async init() {
    if (this.initialized) {
      console.log("RpcClient.init: init called even though this.initialized was true");
      return;
    }

    console.log("RpcClient.init: waiting for this.waitForOpen");
    await this.waitForOpen();
    console.log("RpcClient.init: this.waitForOpen resolved successfully");

    try {
      const [systemStateData, deviceStates] = await Promise.all([
        this.system.api.GetSystemState(),
        this.system.api.GetAllDeviceStates(),
      ]);

      console.log("RpcClient.init: Promise.all resolved");

      this.systemStateData = systemStateData;
      this.deviceStates = { ...deviceStates };
      this.initialized = true;

      this.dispatch("ready", true);
      this.notifyAllDevices();
    } catch (error) {
      this.dispatch("error", { reason: "init-promises-threw", error: error as Error });
      this.close();

      setTimeout(() => {
        this.connect();
      }, 2000);
    }
  }

  private async waitForOpen() {
    if (this.transport.readyState === WebSocket.OPEN) {
      return;
    }

    await this.transport.once("open");
  }

  async refreshDevice(name: Natav.Names<N>) {
    const state = await this.system.api.GetDeviceState(name);
    this.deviceStates[name] = state;
    this.notifyDevice(name);
    return state;
  }

  getDeviceState<Name extends Natav.Names<N>>(name: Name) {
    return this.deviceStates[name as string] as Natav.State<N, Name> | undefined;
  }

  getDeviceConnection<Name extends Natav.Names<N>>(name: Name) {
    return this.systemStateData.connections[name as string]?.connected ?? false;
  }

  device<Name extends Natav.Names<N>>(name: Name): ClientRpcDevice<N, Name> {
    let existing = this.deviceHandles.get(name as string);
    if (existing) {
      return existing as ClientRpcDevice<N, Name>;
    }

    let handle = new ClientRpcDevice(this, name);
    this.deviceHandles.set(name as string, handle as ClientRpcDevice<N, any>);
    return handle;
  }

  async call(device: string, method: string, args: any) {
    await this.waitForOpen();

    const id = this.requestIdCounter++;
    const argsArray = Array.isArray(args) ? args : [args];

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      try {
        this.transport.send(
          JSON.stringify({
            jsonrpc: "2.0" as const,
            id,
            method: "device.call" as const,
            params: {
              device,
              method,
              args: argsArray,
            },
          }),
        );
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  get system(): {
    api: {
      [M in keyof System<N>["api"]]: System<N>["api"][M] extends (...args: infer Args) => infer R ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };
    state: SystemStateData;
  } {
    const api = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }

          return (...args: any[]) => this.callSystem(methodName, ...args);
        },
      },
    ) as {
      [M in keyof System<N>["api"]]: System<N>["api"][M] extends (...args: infer Args) => infer R ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };

    return { api, state: this.systemStateData };
  }

  private async callSystem(method: string, ...args: any) {
    await this.waitForOpen();

    const id = this.requestIdCounter++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      try {
        this.transport.send(
          JSON.stringify({
            jsonrpc: "2.0" as const,
            id,
            method: "system" as const,
            params: {
              call: method,
              args: args.length > 0 ? { args: args[0] } : undefined,
            },
          }),
        );
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  private onMessage(raw: string) {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      this.dispatchEvent(new Event("error"));
      return;
    }

    if (isRPCNotification(data)) {
      if (data.params.type === "natav:state:update") {
        const { name, data: state } = data.params;
        const currentState = this.deviceStates[name];

        this.deviceStates[name] = currentState ? { ...(currentState as object), ...state } : state;

        this.notifyDevice(name);
      }

      if (data.params.type === "natav:device:connected") {
        this.systemStateData.connections[data.params.name] = { connected: true };
        this.notifyDevice(data.params.name);
      }

      if (data.params.type === "natav:device:disconnected") {
        this.systemStateData.connections[data.params.name] = { connected: false };
        this.notifyDevice(data.params.name);
      }

      return;
    }

    if (isRPCResponse(data)) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(data.id);
        pending.resolve(data.result);
      }
      return;
    }

    if (isRPCError(data)) {
      if (data.id === null) {
        return;
      }

      const pending = this.pendingRequests.get(data.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(data.id);

      const error = new Error(data.error.message);
      (error as any).code = data.error.code;
      (error as any).data = data.error.data;
      pending.reject(error);
    }
  }

  private notifyDevice(name: string) {
    this.deviceHandles.get(name)?.notify();
    this.dispatchEvent(new CustomEvent("change", { detail: { name } }));
  }

  private notifyAllDevices() {
    for (let handle of this.deviceHandles.values()) {
      handle.notify();
    }
  }
}
