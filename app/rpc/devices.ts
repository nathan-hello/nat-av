import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { System } from "@av/system";

import { isRPCError, isRPCNotification, isRPCResponse } from "./utils";
import { TypedEventTarget, RemixWebsocket } from "./websocket";

type SystemStateData = {
  connections: Record<string, { connected: boolean }>;
};

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type DeviceChangeEvent<N extends Natav, Name extends Natav.Names<N>> = {
  name: Name;
  state: Natav.State<N, Name> | undefined;
  connected: boolean;
};

type DeviceEvents<N extends Natav, Name extends Natav.Names<N>> = {
  change: DeviceChangeEvent<N, Name>;
};

export class RemixDeviceHandle<
  N extends Natav,
  Name extends Natav.Names<N>,
> extends TypedEventTarget<DeviceEvents<N, Name>> {
  private apiProxy: Natav.Handle<N, Name>["api"];

  constructor(
    private client: RemixRpcClient<N>,
    public readonly name: Name,
  ) {
    super();

    this.apiProxy = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }

          return (...args: any[]) => this.client.call(this.name, methodName, args);
        },
      },
    ) as Natav.Handle<N, Name>["api"];
  }

  get api() {
    return this.apiProxy;
  }

  get state() {
    return this.client.getDeviceState(this.name);
  }

  get connected() {
    return this.client.getDeviceConnection(this.name);
  }

  dep<DepName extends Natav.DepNames<N, Name>>(depName: DepName) {
    return this.client.device(depName);
  }

  refresh() {
    return this.client.refreshDevice(this.name);
  }

  notify() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          name: this.name,
          state: this.state,
          connected: this.connected,
        },
      }),
    );
  }
}

type RpcEvents = {
  ready: void;
  disconnect: CloseEvent;
  error: Event;
  change: { name?: string };
};

export class RemixRpcClient<N extends Natav = natav> extends TypedEventTarget<RpcEvents> {
  private transport: RemixWebsocket;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private deviceStates: Partial<Record<string, unknown>> = {};
  private systemStateData: SystemStateData = { connections: {} };
  private deviceHandles = new Map<string, RemixDeviceHandle<N, any>>();
  private initialized = false;

  constructor() {
    super();
    this.transport = new RemixWebsocket("/ws", {
      reconnect: true,
      retryDelay: 1000,
    });

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.initialized = false;
      this.dispatchEvent(event);
      for (let handle of this.deviceHandles.values()) {
        handle.notify();
      }
    });

    this.transport.on("error", (event) => {
      this.dispatchEvent(event);
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

  async init() {
    if (this.initialized) {
      return;
    }

    await this.waitForOpen();

    try {
      const [systemStateData, deviceStates] = await Promise.all([
        this.system.api.GetSystemState(),
        this.system.api.GetAllDeviceStates(),
      ]);

      this.systemStateData = systemStateData;
      this.deviceStates = { ...deviceStates };
      this.initialized = true;

      this.dispatchEvent(new Event("ready"));
      this.notifyAllDevices();
    } catch (error) {
      this.dispatchEvent(new Event("error"));
      throw error;
    }
  }

  async waitForOpen() {
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

  device<Name extends Natav.Names<N>>(name: Name): RemixDeviceHandle<N, Name> {
    let existing = this.deviceHandles.get(name as string);
    if (existing) {
      return existing as RemixDeviceHandle<N, Name>;
    }

    let handle = new RemixDeviceHandle(this, name);
    this.deviceHandles.set(name as string, handle as RemixDeviceHandle<N, any>);
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
