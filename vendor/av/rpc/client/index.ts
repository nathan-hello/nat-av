import { Rpc, type Drivers, type Events } from "@av/types";

import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import { ClientRpcRequests } from "@av/rpc/client/requests";
import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";

export class RpcClient<
  N extends Drivers.Array,
> extends ProtectedTypedEventTarget<Events.Rpc.Map> {
  private tel = new Telemetry("Rpc");
  private transport: ClientRpcTransport;
  private requests: ClientRpcRequests;
  private deviceHandles = new Map<string, ClientRpcDevice<N, any>>();

  constructor(args: { transport?: ClientRpcTransport } = {}) {
    super();
    this.transport =
      args.transport ??
      new ClientWebsocket("/ws", {
        reconnect: true,
        retryDelay: 1000,
      });
    this.requests = new ClientRpcRequests(this.transport, () =>
      this.emitChange(),
    );

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.requests.rejectAll(
        new Rpc.Error({
          code: Rpc.Error.Codes.RpcDisconnected,
          message: `RPC transport closed${event.reason ? `: ${event.reason}` : ""}`,
        }),
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
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
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
      Rpc.Request.deviceCall(this.requests.nextRequestId(), {
        device,
        method,
        args,
      }),
    );
  }

  request<T = any>(message: Rpc.Request): Promise<T> {
    return this.requests.request<T>(message);
  }

  nextRequestId() {
    return this.requests.nextRequestId();
  }

  // FIXME: we should be getting state on connect
  private async init() {
    this.dispatch("ready", true);
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("JSON_PARSE", () => Rpc.Json.parse(raw));
    if (!parsed.ok || !parsed.data) {
      this.tel.error("json-parse-failed", { raw, parsed });
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    const check = Rpc.Notification.is(parsed.data);

    if (check) {
      const notification = Rpc.Notification.Server.from(check);
      if (!notification) {
        return;
      }

      this.tel.info("got-notification", notification);

      let device: ClientRpcDevice;

      switch (notification.type) {
        case "natav:device:event":
          device = this.device(notification.params.name);
          device.handleEvent(
            notification.params.event,
            notification.params.data,
          );
          break;
        case "natav:state:update":
          device = this.device(notification.params.name);
          device.handleStateUpdate(notification.params.data);
          break;
        default:
          break;
      }
      return;
    }

    const response = Rpc.Response.is(parsed.data);
    if (response) {
      this.requests.handleResponse(response);
      return;
    }

    const rpcError = Rpc.Error.is(parsed.data);
    if (rpcError) {
      this.requests.handleError(rpcError);
    }
  }

  public emitChange(name?: string) {
    this.dispatch("change", { name });
  }
}
