import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { System } from "@av/system";

import { isRPCError, isRPCNotification, isRPCResponse } from "@av/rpc/utils";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { PendingRequest, RpcEvents, SystemStateData } from "@av/rpc/client/types";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import { Telemetry } from "@av/telemetry";

export class ClientRpc<N extends Natav = natav> extends TypedEventTarget<RpcEvents> {
  private tel = new Telemetry("ClientRpc");
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
      super.dispatch("error", { reason: "transport", event });
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
      this.tel.error("init called even though this.initialized was true");
      return;
    }

    this.tel.debug("waiting for this.waitForOpen");
    await this.waitForOpen();
    this.tel.debug("this.waitForOpen resolved successfully");

    const states = await this.tel.task("GET_INITIAL_STATE", async () => {
      return await Promise.all([
        this.system.api.GetSystemState(),
        this.system.api.GetAllDeviceStates(),
      ]);
    });

    if (!states.ok || isRPCError(states.data)) {
      if (!states.ok) {
        this.dispatch("error", { reason: "init-promises-threw", error: new Error(states.error) });
      }
      if (isRPCError(states.data)) {
        this.dispatch("error", { reason: "rpc-error", error: states.data });
      }

      this.close();
      setTimeout(() => {
        this.connect();
      }, 2000);
      return;
    }

    this.tel.info("successfully resolved promises");
    const [system, devices] = states.data;

    this.systemStateData = system;
    this.deviceStates = { ...devices };
    this.initialized = true;

    this.dispatch("ready", true);
    this.notifyAllDevices();
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

    this.tel.debug("device.call", { device, method, args, id });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Device RPC call timed out after ${this.timeout}ms id ${id}`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      const str = this.tel.task("JSON_STRINGIFY", () => {
        return JSON.stringify({
          jsonrpc: "2.0" as const,
          id,
          method: "device.call" as const,
          params: {
            device,
            method,
            args: argsArray,
          },
        });
      });

      if (!str.ok) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(str.error);
        return;
      }

      this.transport.send(str.data);
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

    this.tel.debug("system", { method, args, id });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`System RPC call timed out after ${this.timeout}ms id: ${id}`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      const str = this.tel.task("JSON_STRINGIFY", () => {
        return JSON.stringify({
          jsonrpc: "2.0" as const,
          id,
          method: "system" as const,
          params: {
            call: method,
            args: args.length > 0 ? { args: args[0] } : undefined,
          },
        });
      });

      if (!str.ok) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(str.error);
        return;
      }

      this.transport.send(str.data);
    });
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("JSON_PARSE", () => {
      return JSON.parse(raw);
    });
    if (!parsed.ok) {
      const err = {
        time: new Date().toISOString().slice(11, 23),
        context: { spanId: undefined, traceId: undefined, traceName: "CLIENT_INTERNAL" },
        severity: { id: 50, text: "ERROR" },
        name: "UNABLE_TO_JSON_PARSE_LOG",
        data: raw,
      };

      this.tel.error("json-parse-failed", { raw, parsed, err });
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    if (isRPCNotification(parsed.data)) {
      this.tel.info("got-notification", parsed.data);
      if (parsed.data.params.type === "natav:state:update") {
        const { name, data: state } = parsed.data.params;
        const currentState = this.deviceStates[name];

        this.deviceStates[name] = currentState ? { ...(currentState as object), ...state } : state;

        this.notifyDevice(name);
      }

      if (parsed.data.params.type === "natav:device:connected") {
        this.systemStateData.connections[parsed.data.params.name] = { connected: true };
        this.notifyDevice(parsed.data.params.name);
      }

      if (parsed.data.params.type === "natav:device:disconnected") {
        this.systemStateData.connections[parsed.data.params.name] = { connected: false };
        this.notifyDevice(parsed.data.params.name);
      }

      return;
    }

    if (isRPCResponse(parsed.data)) {
      this.tel.info("got-response", parsed.data);
      const pending = this.pendingRequests.get(parsed.data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(parsed.data.id);
        pending.resolve(parsed.data.result);
      }
      return;
    }

    if (isRPCError(parsed.data)) {
      this.tel.info("got-error", parsed.data);
      if (parsed.data.id === null) {
        return;
      }

      const pending = this.pendingRequests.get(parsed.data.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(parsed.data.id);

      const error = new Error(parsed.data.error.message);
      (error as any).code = parsed.data.error.code;
      (error as any).data = parsed.data.error.data;
      pending.reject(error);
    }
  }

  private notifyDevice(name: string) {
    this.deviceHandles.get(name)?.notify();
    this.dispatch("change", { name });
  }

  private notifyAllDevices() {
    for (let handle of this.deviceHandles.values()) {
      handle.notify();
    }
  }
}
