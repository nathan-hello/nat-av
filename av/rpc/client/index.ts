import type { Drivers, Events } from "@av/types";

import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import { ClientRpcRequests } from "@av/rpc/client/requests";
import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { RpcDebugClient } from "@av/rpc/debug/client";
import {
  RPCError,
  RPCNotification,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import { Telemetry } from "@av/telemetry";

export class ClientRpc<
  N extends Drivers.Array,
> extends ProtectedTypedEventTarget<Events.Rpc.Map> {
  private tel = new Telemetry("Rpc");
  private transport: ClientRpcTransport;
  private requests: ClientRpcRequests;
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();
  public debug: RpcDebugClient<N>;

  constructor(args: { transport?: ClientRpcTransport } = {}) {
    super();
    this.transport =
      args.transport ??
      new ClientWebsocket("/ws", {
        reconnect: true,
        retryDelay: 1000,
      });
    this.debug = new RpcDebugClient(this);
    this.requests = new ClientRpcRequests(this.transport, () =>
      this.emitChange(),
    );

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.requests.rejectAll(
        new Error(
          `RPC transport closed${event.reason ? `: ${event.reason}` : ""}`,
        ),
      );
      this.dispatch("close", event);
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
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
    this.debug.close(code, reason);
  }

  get isOnline() {
    return this.transport.readyState === WebSocket.OPEN;
  }

  device<Name extends Drivers.Names<N>>(name: Name): ClientRpcDevice<N, Name> {
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
    return this.requests.request(
      new RPCRequest(this.requests.nextRequestId(), "device.call", {
        device,
        method,
        args,
      }),
    );
  }

  request<T = any>(message: RPCRequest): Promise<T> {
    return this.requests.request<T>(message);
  }

  nextRequestId() {
    return this.requests.nextRequestId();
  }

  private async init() {
    const initial = await this.tel.task("GET_INITIAL_STATE", async () => {
      return await Promise.all([]);
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
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("JSON_PARSE", () => JSON.parse(raw));
    if (!parsed.ok || !parsed.data) {
      this.tel.error("json-parse-failed", { raw, parsed });
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    const notification = RPCNotification.is(parsed.data);

    if (notification) {
      this.tel.info("got-notification", parsed.data);

      // TSAS: Casting as unknown so we are forced to actually
      // parse through the types. Otherwise this object will be
      // typed as `any`
      const params = parsed.data.params as {
        type?: unknown;
        name?: unknown;
        event?: unknown;
        data?: unknown;
      };

      if (typeof params.name === "string") {
        // TSAS: The notification payload carries the device name as an untyped string.
        const deviceName = params.name as Drivers.Names<N>;
        const device = this.device(deviceName);
        switch (params.type) {
          case "natav:device:event":
            if (typeof params.event === "string") {
              device.handleEvent(params.event, params.data);
            }
            break;
          case "natav:state:update":
            device.handleStateUpdate(
              // TSAS: The server sends partial device state updates.
              (params.data ?? {}) as Partial<Drivers.State<N, typeof deviceName>>,
            );
            break;
          default:
            break;
        }
      }
      return;
    }

    const response = RPCResponse.is(parsed.data);
    if (response) {
      this.requests.handleResponse(response);
      return;
    }

    const rpcError = RPCError.is(parsed.data);
    if (rpcError) {
      this.requests.handleError(rpcError);
    }
  }

  public emitChange(name?: string) {
    this.dispatch("change", { name });
  }
}
