import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { System, SystemStateData } from "@av/system";
import type { ApiSurfaceSchema } from "@av/schema/types";

import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import {
  createDeviceCallRequest,
  createSystemApiRequest,
  createSystemStateRequest,
  parseRPCMessage,
  serializeRPCMessage,
} from "@av/rpc/protocol";
import type {
  ClientRpcBindings,
  DebugEntry,
  PendingRequest,
  RpcEvents,
} from "@av/rpc/client/types";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { isRPCError, isRPCNotification, isRPCResponse } from "@av/rpc/utils";
import { Telemetry } from "@av/telemetry";

type SystemApi<N extends Natav> = {
  [M in keyof System<N>["api"]]: System<N>["api"][M] extends (...args: infer Args) => infer R ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type ClientRpcSystem<N extends Natav> = {
  api: SystemApi<N>;
  readonly state: Promise<SystemStateData>;
};

export class ClientRpc<N extends Natav = natav> extends ProtectedTypedEventTarget<RpcEvents> {
  private tel = new Telemetry("ClientRpc");
  private transport: ClientWebsocket;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private systemApiProxy: SystemApi<N>;
  private systemHandle: ClientRpcSystem<N>;

  public schema: ClientRpcBindings = {} as ClientRpcBindings;
  public debugEntries: DebugEntry[] = [];
  public deviceStates: Record<string, unknown> = {};
  public systemStateData: SystemStateData = null;

  constructor() {
    super();
    this.transport = new ClientWebsocket("/ws", {
      reconnect: true,
      retryDelay: 1000,
    });
    this.systemApiProxy = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }

          return (...args: any[]) => this.callSystem(methodName, ...args);
        },
      },
    ) as SystemApi<N>;

    this.systemHandle = { api: this.systemApiProxy } as ClientRpcSystem<N>;
    Object.defineProperty(this.systemHandle, "state", {
      enumerable: true,
      get: () => this.getSystemState(),
    });

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      super.dispatch("close", event);
      this.notifyAllDevices();
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

  get isOnline() {
    return this.transport.readyState === WebSocket.OPEN;
  }

  private async init() {
    this.tel.debug("waiting for this.waitForOpen");
    await this.waitForOpen();
    this.tel.debug("this.waitForOpen resolved successfully");

    const initial = await this.tel.task("GET_INITIAL_STATE", async () => {
      return await Promise.all([this.system.api.GetSchema(), this.getSystemState()]);
    });

    if (!initial.ok) {
      if (!initial.ok) {
        this.dispatch("error", { reason: "init-promises-threw", error: new Error(initial.error) });
      }

      this.close();
      setTimeout(() => {
        this.connect();
      }, 2000);
      return;
    }

    this.tel.info("successfully resolved promises");
    const [schema, systemState] = initial.data;

    this.schema = schema;
    this.applySystemState(systemState);

    this.dispatch("ready", true);
    this.notifyAllDevices();
    this.dispatch("change", {});
  }

  private async waitForOpen() {
    if (this.transport.readyState === WebSocket.OPEN) {
      return;
    }

    await this.transport.once("open");
  }

  device<Name extends Natav.Names<N>>(name: Name): ClientRpcDevice<N, Name> {
    const cached = this.deviceHandles.get(name);
    if (cached) {
      return cached as ClientRpcDevice<N, Name>;
    }

    const device = new ClientRpcDevice(this, name);
    this.deviceHandles.set(name, device);
    return device;
  }

  async call(device: string, method: string, args: any[] = []) {
    this.tel.debug("device.call", { device, method, args });
    return this.request(createDeviceCallRequest(this.nextRequestId(), device, method, args));
  }

  get system(): ClientRpcSystem<N> {
    return this.systemHandle;
  }

  private async callSystem(method: string, ...args: any) {
    const id = this.nextRequestId();
    this.tel.debug("system", { method, args, id });
    return this.request(createSystemApiRequest(id, method, args));
  }

  async getSystemState(): Promise<SystemStateData> {
    const state = await this.request<SystemStateData>(
      createSystemStateRequest(this.nextRequestId()),
    );
    this.applySystemState(state);
    return state;
  }

  getDeviceState<Name extends Natav.Names<N>>(name: Name): Natav.State<N, Name> | undefined {
    return this.deviceStates[name] as Natav.State<N, Name> | undefined;
  }

  getDeviceSchema<Name extends Natav.Names<N>>(name: Name) {
    return this.schema.devices?.[name] as ApiSurfaceSchema | undefined;
  }

  refreshDevice<Name extends Natav.Names<N>>(name: Name) {
    this.deviceHandles.get(name as string)?.dispatchChange();
    this.dispatch("change", { name });
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("JSON_PARSE", () => parseRPCMessage(raw));
    if (!parsed.ok) {
      this.tel.error("json-parse-failed", { raw, parsed });
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    if (isRPCNotification(parsed.data)) {
      this.tel.info("got-notification", parsed.data);
      if (parsed.data.params.type === "natav:state:update") {
        const { name, data: state } = parsed.data.params;
        const currentState = this.deviceStates[name];
        const nextState =
          currentState && typeof currentState === "object" ?
            { ...(currentState as object), ...state }
          : state;

        this.deviceStates[name] = nextState;
        this.refreshDevice(name);
      }

      return;
    }

    if (isDebugEntry(parsed.data)) {
      this.pushDebugEntry(parsed.data);
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

  private pushDebugEntry(entry: DebugEntry) {
    this.debugEntries = [entry, ...this.debugEntries].slice(0, 500);
  }

  private applySystemState(state: SystemStateData) {
    this.systemStateData = state;
  }

  private nextRequestId() {
    return this.requestIdCounter++;
  }

  private async request<T = any>(message: {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: any;
  }) {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`RPC call timed out after ${this.timeout}ms id ${message.id}`));
      }, this.timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      const str = this.tel.task("JSON_STRINGIFY", () => serializeRPCMessage(message));
      if (!str.ok) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(message.id);
        reject(new Error(str.error));
        return;
      }

      try {
        this.transport.send(str.data);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(message.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private notifyAllDevices() {
    for (const handle of this.deviceHandles.values()) {
      handle.dispatchChange();
    }
  }
}

function isDebugEntry(value: unknown): value is DebugEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<DebugEntry>;
  return (
    typeof entry.time === "string" &&
    typeof entry.name === "string" &&
    !!entry.context &&
    typeof entry.context === "object" &&
    !!entry.severity &&
    typeof entry.severity === "object"
  );
}
