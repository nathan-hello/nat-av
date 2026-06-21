import type { Manager } from "@av/drivers";
import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpcDriver } from "@av/rpc/client/driver";
import { ClientRpcRequests } from "@av/rpc/client/requests";
import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";
import { Rpc, type Drivers, type Events } from "@av/types";

export class RpcClient<
  N extends Manager = Manager,
> extends ProtectedTypedEventTarget<Events.Rpc.Map> {
  private tel = new Telemetry("Rpc");
  private transport: ClientRpcTransport;
  private requests: ClientRpcRequests;
  private driverHandles = new Map<string, ClientRpcDriver<N, any>>();
  private _context: Rpc.Server.Context | undefined;
  private initPromise: Promise<void> | undefined;
  private initResolve: (() => void) | undefined;
  private initReject: ((err: unknown) => void) | undefined;

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

  connect(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.transport.connect();
    this.initPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
    });
    return this.initPromise;
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
  }

  get isOnline() {
    return this.transport.readyState === WebSocket.OPEN;
  }

  get ctx() {
    if (!this._context) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.CtxNotFound,
        message: "client",
      });
    }
    return this._context;
  }

  driver<Name extends Drivers.Names<N["configs"]>>(
    name: Name,
  ): ClientRpcDriver<N, Name> {
    const cached = this.driverHandles.get(name);
    if (cached) {
      return cached;
    }

    const driver = new ClientRpcDriver(this, name);
    this.driverHandles.set(name, driver);
    return driver;
  }

  async call(driver: string, method: string, args: any[] = []) {
    return this.requests.request(
      Rpc.Request.driverCall(this.requests.nextRequestId(), {
        driver: driver,
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

  private async init() {
    try {
      const result = await this.requests.request<{
        context: Rpc.Server.Context;
        states: Record<string, Rpc.Json.Value>;
      }>(Rpc.Request.driverInit(this.requests.nextRequestId()));

      this._context = result.context;
      this.dispatch("peer", result.context);

      for (const [name, state] of Object.entries(result.states)) {
        // TSAS: driver names from server response are guaranteed to match registered drivers
        const driver = this.driver(name as Drivers.Names<N["configs"]>);
        driver.handleStateUpdate(
          state as Drivers.State<N["configs"], (typeof driver)["name"]>,
        );
      }

      this.dispatch("ready", true);
      this.initResolve?.();
    } catch (err) {
      this.tel.error("init-failed", { error: err });
      this.initReject?.(err);
      this.dispatch("error", {
        reason: "init-promises-threw",
        error: err as Error,
      });
    }
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

      let driver: ClientRpcDriver;

      switch (notification.type) {
        case "natav:peer":
          this._context = notification.params;
          this.dispatch("peer", notification.params);
          break;
        case "natav:driver:event":
          driver = this.driver(notification.params.name);
          driver.handleEvent(
            notification.params.event,
            notification.params.data,
          );
          break;
        case "natav:state:update":
          driver = this.driver(notification.params.name);
          driver.handleStateUpdate(notification.params.data);
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
