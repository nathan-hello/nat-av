import type { Natav } from "@av/types";
import type { natav } from "@av/index";

import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { RpcDebugClient } from "@av/rpc/debug/client";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import { ClientRpcSystem } from "@av/rpc/client/system";
import {
  RPCNotification,
  RPCRequest,
  RPCError,
  RPCResponse,
} from "@av/rpc/protocol";
import type { PendingRequest, RpcEvents } from "@av/rpc/client/types";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";
import { isRPCNotification } from "@av/rpc/utils";

export class ClientRpc<
  N extends Natav.Orch = natav,
> extends ProtectedTypedEventTarget<RpcEvents> {
  private tel = new Telemetry("Rpc");
  private transport: ClientWebsocket;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private systemHandle: ClientRpcSystem<N>;
  public debug: RpcDebugClient;

  constructor() {
    super();
    this.transport = new ClientWebsocket("/ws", {
      reconnect: true,
      retryDelay: 1000,
    });
    this.debug = new RpcDebugClient(this);

    this.systemHandle = new ClientRpcSystem({
      request: (message) => this.request(message),
      emitChange: (name) => this.emitChange(name),
      nextRequestId: () => this.nextRequestId(),
    });

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.rejectAllPendingRequests(
        new Error(
          `RPC transport closed${event.reason ? `: ${event.reason}` : ""}`,
        ),
      );
      this.dispatch("close", event);
      this.systemHandle.reset();
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
    this.debug.connect();
    return this;
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
    this.debug.close(code, reason);
    return this;
  }

  get isOnline() {
    return this.transport.readyState === WebSocket.OPEN;
  }

  private async init() {
    await this.waitForOpen();

    const initial = await this.tel.task("GET_INITIAL_STATE", async () => {
      return await Promise.all([this.systemHandle.state]);
    });

    if (!initial.ok) {
      this.dispatch("error", {
        reason: "init-promises-threw",
        error: new Error(initial.error),
      });

      this.close();
      setTimeout(() => {
        this.connect();
      }, 2000);
      return;
    }

    this.tel.info("successfully resolved promises");

    this.dispatch("ready", true);
    this.notifyAllDevices();
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
      return cached;
    }

    const device = new ClientRpcDevice(this, name);
    this.deviceHandles.set(name, device);
    return device;
  }

  async call(device: string, method: string, args: any[] = []) {
    this.tel.debug("device.call", { device, method, args });
    return this.request(
      new RPCRequest(this.nextRequestId(), "device.call", {
        device,
        method,
        args,
      }),
    );
  }

  get system() {
    return this.systemHandle;
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

      // TSAS: Casting as unknown so we are forced to actually
      // parse through the types. Otherwise this object will be
      // typed as `any`
      const params = parsed.data.params as {
        type?: unknown;
        name?: unknown;
        data?: unknown;
      };

      if (
        params.type === "natav:state:update" &&
        typeof params.name === "string"
      ) {
        // TSAS: The notification payload carries the device name as an untyped string.
        const deviceName = params.name as Natav.Names<N>;
        const device = this.device(deviceName);
        device.handleStateUpdate(
          // TSAS: The server sends partial device state updates.
          (params.data ?? {}) as Partial<Natav.State<N, typeof deviceName>>,
        );
      }

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
      // TSAS:
      (error as any).code = rpcError.error.code;
      // TSAS:
      (error as any).data = rpcError.error.data;
      this.rejectPendingRequest(rpcError.id, error);
    }
  }

  public emitChange(name?: string) {
    this.dispatch("change", { name });
  }

  private nextRequestId() {
    return this.requestIdCounter++;
  }

  private resolvePendingRequest(id: string | number, result: unknown) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.resolve(result);
  }

  private rejectPendingRequest(id: string | number, error: Error) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.reject(error);
  }

  private rejectAllPendingRequests(error: Error) {
    for (const id of this.pendingRequests.keys()) {
      this.rejectPendingRequest(id, new Error(error.message));
    }
  }

  private async request<T = any>(message: RPCRequest) {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectPendingRequest(
          message.id,
          new Error(
            `RPC call timed out after ${this.timeout}ms id ${message.id}`,
          ),
        );
      }, this.timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      const str = this.tel.task("JSON_STRINGIFY", () =>
        RPCNotification.serialize(message),
      );
      if (!str.ok) {
        this.rejectPendingRequest(message.id, new Error(str.error));
        return;
      }

      const send = this.tel.task("WS_SEND", () =>
        this.transport.send(str.data),
      );
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
