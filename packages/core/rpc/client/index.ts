import {
  type Drivers,
  type Manager,
  Err,
  Telemetry,
  TypedEventTarget,
} from "../../client.js";
import { Rpc } from "../types.js";
import { ClientRpcDriver } from "./driver.js";
import { ClientRpcRequests } from "./requests.js";
import type { ClientRpcTransport } from "./websocket.js";
import { ClientWebsocket } from "./websocket.js";

export class RpcClient<
  N extends Manager = Manager,
> extends TypedEventTarget<Rpc.Events.Map> {
  readonly driver: Rpc.Client.DriverAccessor<N>;
  private tel = new Telemetry("Rpc");
  private transport: ClientRpcTransport;
  private requests: ClientRpcRequests;
  private driverHandles = new Map<string, ClientRpcDriver<N, any>>();
  private initPromise: Promise<void> | undefined;
  private initResolve: (() => void) | undefined;
  private initReject: ((err: unknown) => void) | undefined;

  constructor(args: { transport?: ClientRpcTransport } = {}) {
    super();
    // TSAS: The callable accessor is augmented with virtual name properties by the Proxy below.
    const accessor = ((name: Drivers.Names<N["drivers"]>) =>
      this.getDriver(name)) as unknown as Rpc.Client.DriverAccessor<N>;
    // TSAS: Proxy properties are created from the same literal driver names as the callable accessor.
    this.driver = new Proxy(accessor, {
      get: (target, property, receiver) => {
        if (typeof property === "string" && property in target) {
          return Reflect.get(target, property, receiver);
        }
        if (typeof property === "string") {
          // TSAS: Proxy property access is checked against the registered catalog by the server.
          return this.getDriver(property as Drivers.Names<N["drivers"]>);
        }
        return Reflect.get(target, property, receiver);
      },
    });
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
          code: Err.Codes.RpcDisconnected,
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

  private getDriver<Name extends Drivers.Names<N["drivers"]>>(
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

  request<Request extends Rpc.Request>(
    message: Request,
  ): Promise<Rpc.Request.ResultOf<Request>> {
    return this.requests.request(message);
  }

  nextRequestId() {
    return this.requests.nextRequestId();
  }

  private async init() {
    const result = await this.requests.request(
      Rpc.Request.driverInit(this.requests.nextRequestId()),
    );

    this.dispatch("peer", result.context);

    for (const [name, state] of Object.entries(result.states)) {
      // TSAS: driver names from server response are guaranteed to match registered drivers
      const driver = this.getDriver(name as Drivers.Names<N["drivers"]>);
      driver.handleStateUpdate(
        // TSAS: The init response state belongs to this catalog entry.
        state as Drivers.State<N["drivers"], (typeof driver)["name"]>,
      );
    }

    this.dispatch("ready", true);
    this.initResolve?.();
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

       let driver: ClientRpcDriver<N, Drivers.Names<N["drivers"]>>;

      switch (notification.type) {
        case "natav:driver:event":
          // TSAS: Server notifications are restricted to the registered driver catalog at runtime.
          driver = this.getDriver(notification.params.name as Drivers.Names<N["drivers"]>);
          driver.handleEvent(
            notification.params.event,
            notification.params.data,
          );
          break;
        case "natav:state:update":
          // TSAS: Server notifications are restricted to the registered driver catalog at runtime.
          driver = this.getDriver(notification.params.name as Drivers.Names<N["drivers"]>);
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
