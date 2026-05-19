import type Natav from "@av/natav";
import type { natav } from "@av/index";
import type { System, SystemStateData } from "@av/system";
import type { ApiSurfaceSchema } from "@av/schema/types";

import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import { RPCNotification, RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import type {
  ClientRpcBindings,
  DebugEntry,
  PendingRequest,
  RpcEvents,
} from "@av/rpc/client/types";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";
import { isRPCNotification } from "@av/rpc/utils";

type SystemApi<N extends Natav> = {
  [M in keyof System<N>["api"]]: System<N>["api"][M] extends (...args: infer Args) => infer R ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type SystemMethodName<N extends Natav> = Extract<keyof System<N>["api"], string>;

type ClientRpcSystem<N extends Natav> = {
  api: SystemApi<N>;
  readonly state: Promise<SystemStateData>;
  isPending(method: SystemMethodName<N>): boolean;
  pendingCount(method: SystemMethodName<N>): number;
};

type DeviceStateMap<N extends Natav> = Partial<{
  [K in Natav.Names<N>]: Natav.State<N, K>;
}>;

export class ClientRpc<N extends Natav = natav> extends ProtectedTypedEventTarget<RpcEvents> {
  private tel = new Telemetry("Rpc");
  private transport: ClientWebsocket;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private pendingCounts = new Map<string, number>();
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private systemApiProxy: SystemApi<N>;
  private systemHandle: ClientRpcSystem<N>;

  public schema: ClientRpcBindings = {} as ClientRpcBindings;
  public debugEntries: DebugEntry[] = [];
  public deviceStates: DeviceStateMap<N> = {};
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

    this.systemHandle = {
      api: this.systemApiProxy,
      isPending: (method) => this.isSystemPending(method),
      pendingCount: (method) => this.getSystemPendingCount(method),
    } as ClientRpcSystem<N>;
    Object.defineProperty(this.systemHandle, "state", {
      enumerable: true,
      get: () => this.getSystemState(),
    });

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.rejectAllPendingRequests(
        new Error(`RPC transport closed${event.reason ? `: ${event.reason}` : ""}`),
      );
      this.dispatch("close", event);
      this.notifyAllDevices();
    });

    this.transport.on("error", (event) => {
      this.dispatch("error", { reason: "transport", event });
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
    await this.waitForOpen();

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
    return this.request(
      new RPCRequest(this.nextRequestId(), "device.call", { device, method, args }),
      this.getDevicePendingKey(device, method),
    );
  }

  get system(): ClientRpcSystem<N> {
    return this.systemHandle;
  }

  private async callSystem(method: string, ...args: any) {
    const id = this.nextRequestId();
    this.tel.debug("system", { method, args, id });
    return this.request(new RPCRequest(id, "system.api", { method, args }), this.getSystemPendingKey(method));
  }

  async getSystemState(): Promise<SystemStateData> {
    const state = await this.request<SystemStateData>(
      new RPCRequest(this.nextRequestId(), "system.state"),
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

  isDevicePending<Name extends Natav.Names<N>>(
    name: Name,
    method: Extract<keyof Natav.Handle<N, Name>["api"], string>,
  ) {
    return this.getDevicePendingCount(name, method) > 0;
  }

  getDevicePendingCount<Name extends Natav.Names<N>>(
    name: Name,
    method: Extract<keyof Natav.Handle<N, Name>["api"], string>,
  ) {
    return this.pendingCounts.get(this.getDevicePendingKey(name, method)) ?? 0;
  }

  isSystemPending(method: SystemMethodName<N>) {
    return this.getSystemPendingCount(method) > 0;
  }

  getSystemPendingCount(method: SystemMethodName<N>) {
    return this.pendingCounts.get(this.getSystemPendingKey(method)) ?? 0;
  }

  refreshDevice<Name extends Natav.Names<N>>(name: Name) {
    this.deviceHandles.get(name as string)?.dispatchChange();
    this.dispatch("change", { name });
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("JSON_PARSE", () => JSON.parse(raw));
    if (!parsed.ok || !parsed.data) {
      this.tel.error("json-parse-failed", { raw, parsed });
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    if (isRPCNotification(parsed.data)) {
      this.tel.info("got-notification", parsed.data);

      const params = parsed.data.params as {
        type?: unknown;
        name?: unknown;
        data?: unknown;
      };

      if (params.type === "natav:state:update" && typeof params.name === "string") {
        this.mergeDeviceState(
          params.name as Natav.Names<N>,
          (params.data ?? {}) as Partial<Natav.State<N, Natav.Names<N>>>,
        );
        this.refreshDevice(params.name as Natav.Names<N>);
      }

      return;
    }

    if (isDebugEntry(parsed.data)) {
      this.pushDebugEntry(parsed.data);
      return;
    }

    const response = RPCResponse.parse(parsed.data);
    if (response) {
      this.tel.info("got-response", response);
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.resolvePendingRequest(response.id, response.result);
      }
      return;
    }

    const rpcError = RPCError.parse(parsed.data);
    if (rpcError) {
      this.tel.info("got-error", rpcError);
      if (rpcError.id === null) {
        return;
      }

      const pending = this.pendingRequests.get(rpcError.id);
      if (!pending) {
        return;
      }

      const error = new Error(rpcError.error.message);
      (error as any).code = rpcError.error.code;
      (error as any).data = rpcError.error.data;
      this.rejectPendingRequest(rpcError.id, error);
    }
  }

  private pushDebugEntry(entry: DebugEntry) {
    this.debugEntries = [entry, ...this.debugEntries].slice(0, 500);
  }

  private applySystemState(state: SystemStateData) {
    this.systemStateData = state;
  }

  private mergeDeviceState<Name extends Natav.Names<N>>(
    name: Name,
    patch: Partial<Natav.State<N, Name>>,
  ) {
    const currentState = this.deviceStates[name];
    const nextState =
      currentState && typeof currentState === "object" ?
        { ...(currentState as object), ...patch }
      : patch;

    this.deviceStates[name] = nextState as Natav.State<N, Name>;
  }

  private nextRequestId() {
    return this.requestIdCounter++;
  }

  private getDevicePendingKey(device: string, method: string) {
    return `device:${device}:${method}`;
  }

  private getSystemPendingKey(method: string) {
    return `system:${method}`;
  }

  private incrementPending(key?: string) {
    if (!key) {
      return;
    }

    this.pendingCounts.set(key, (this.pendingCounts.get(key) ?? 0) + 1);
    this.dispatch("change", {});
  }

  private decrementPending(key?: string) {
    if (!key) {
      return;
    }

    const current = this.pendingCounts.get(key);
    if (!current) {
      return;
    }

    if (current === 1) {
      this.pendingCounts.delete(key);
    } else {
      this.pendingCounts.set(key, current - 1);
    }

    this.dispatch("change", {});
  }

  private resolvePendingRequest(id: string | number, result: unknown) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    this.decrementPending(pending.pendingKey);
    pending.resolve(result);
  }

  private rejectPendingRequest(id: string | number, error: Error) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    this.decrementPending(pending.pendingKey);
    pending.reject(error);
  }

  private rejectAllPendingRequests(error: Error) {
    for (const id of this.pendingRequests.keys()) {
      this.rejectPendingRequest(id, new Error(error.message));
    }
  }

  private async request<T = any>(message: RPCRequest, pendingKey?: string) {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      this.incrementPending(pendingKey);

      const timeoutId = setTimeout(() => {
        this.rejectPendingRequest(
          message.id,
          new Error(`RPC call timed out after ${this.timeout}ms id ${message.id}`),
        );
      }, this.timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutId,
        pendingKey,
      });

      const str = this.tel.task("JSON_STRINGIFY", () => RPCNotification.serialize(message));
      if (!str.ok) {
        this.rejectPendingRequest(message.id, new Error(str.error));
        return;
      }

      const send = this.tel.task("WS_SEND", () => this.transport.send(str.data));
      if (!send.ok) {
        this.rejectPendingRequest(message.id, new Error(String(send.error)));
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
