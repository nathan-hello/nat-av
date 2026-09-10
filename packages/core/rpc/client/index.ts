import { type Natav, Err, Telemetry, TypedEventTarget } from "../../client.js";
import { Rpc } from "../types.js";
import { ClientRpcDriver } from "./driver.js";
import { ClientRpcRequests } from "./requests.js";
import type { ClientRpcTransport } from "./websocket.js";
import { ClientWebsocket } from "./websocket.js";

export class RpcClient<
  N extends Natav.Runtime = Natav,
> extends TypedEventTarget<Rpc.Events.Map> {
  readonly driver: Rpc.Client.Drivers<N>;
  readonly plugin: Rpc.Client.Plugins<N>;
  private tel = new Telemetry("Rpc");
  private transport: ClientRpcTransport;
  private requests: ClientRpcRequests;
  private driverHandles = new Map<string, ClientRpcDriver<N, any>>();
  private pluginHandles = new Map<string, ClientRpcDriver<N, any, any>>();
  private groupCatalog = new Map<string, readonly string[]>();
  private driverNames: readonly string[] = [];
  private pluginNames: readonly string[] = [];
  private initPromise: Promise<void> | undefined;
  private initResolve: (() => void) | undefined;
  private initReject: ((err: unknown) => void) | undefined;

  constructor(args: { transport?: ClientRpcTransport } = {}) {
    super();
    // TSAS: The callable accessor is augmented with virtual name properties by the Proxy below.
    // TSAS: The callable accessor is narrowed by the static path union.
    const accessor = ((path: Rpc.Client.Path<N>) =>
      this.getDriverPath(path)) as unknown as Rpc.Client.Drivers<N>;
    // TSAS: Proxy properties are created from the same literal driver names as the callable accessor.
    this.driver = new Proxy(accessor, {
      get: (target, property, receiver) => {
        if (typeof property === "string" && property in target) {
          return Reflect.get(target, property, receiver);
        }
        if (typeof property === "string") {
          // TSAS: Proxy property access is checked against the registered catalog by the server.
          return this.getDriver(property as Natav.Names<N["drivers"]>);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    // TSAS: The callable proxy is augmented with virtual plugin-name properties below.
    const pluginAccessor = ((name: Natav.Names<N["plugins"]>) =>
      this.getPlugin(name)) as unknown as Rpc.Client.Plugins<N>;
    this.plugin = new Proxy(pluginAccessor, {
      get: (target, property, receiver) => {
        if (typeof property === "string" && property in target) {
          return Reflect.get(target, property, receiver);
        }
        if (typeof property === "string") {
          // TSAS: Proxy property names are checked against the server's plugin catalog.
          return this.getPlugin(property as Natav.Names<N["plugins"]>);
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

  private getDriver<Name extends Natav.Names<N["drivers"]>>(
    name: Name,
  ): ClientRpcDriver<N, N["drivers"], Name> {
    const cached = this.driverHandles.get(name);
    if (cached) {
      return cached;
    }

    const driver = new ClientRpcDriver<N, N["drivers"], Name>(this, name);
    this.driverHandles.set(name, driver);
    return driver;
  }

  private getPlugin<Name extends Natav.Names<N["plugins"]>>(
    name: Name,
  ): ClientRpcDriver<N, N["plugins"], Name> {
    const cached = this.pluginHandles.get(name);
    if (cached) {
      // TSAS: The cache key is the same plugin name used to create this handle.
      return cached as ClientRpcDriver<N, N["plugins"], Name>;
    }
    const plugin = new ClientRpcDriver<N, N["plugins"], Name>(this, name);
    this.pluginHandles.set(name, plugin);
    return plugin;
  }

  private getGroup<Path extends Natav.GroupPaths<N["input"]>>(
    path: Path,
  ): Rpc.Client.Group<N, Path> {
    const group = {
      array: () =>
        (this.groupCatalog.get(path) ?? []).map((name) =>
          this.getDriver(name as Natav.Names<N["drivers"]>),
        ) as unknown as Rpc.Proxy<N["drivers"][number]>[],
    };
    // TSAS: The proxy exposes the recursively typed group properties at runtime.
    return new Proxy(group, {
      get: (target, property, receiver) => {
        if (property === "array") {
          return Reflect.get(target, property, receiver);
        }
        if (typeof property === "string" && property !== "then") {
          const childPath = `${path}/${property}`;
          if (this.groupCatalog.has(childPath)) {
            const members = this.groupCatalog.get(childPath) ?? [];
            const hasChildren = [...this.groupCatalog.keys()].some(
              (candidate) =>
                candidate !== childPath &&
                candidate.startsWith(`${childPath}/`),
            );
            if (!hasChildren && members.length === 1) {
              return this.getDriver(
                members[0] as Natav.Names<N["drivers"]>,
              );
            }
            if (!hasChildren && members.length > 1) {
              return members.map((name) =>
                this.getDriver(name as Natav.Names<N["drivers"]>),
              );
            }
            return this.getGroup(childPath as Natav.GroupPaths<N["input"]>);
          }
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Rpc.Client.Group<N, Path>;
  }

  private getDynamicGroup(
    path: string,
  ): Rpc.Client.DynamicGroup<N> {
    return {
      array: async () => {
        const entries = await this.request(
          Rpc.Request.catalogList(this.nextRequestId(), path),
        );
        return entries.map((entry) =>
          // TSAS: Names come from the server's current group membership.
          this.getDriver(entry.name as Natav.Names<N["drivers"]>),
        ) as unknown as Rpc.Proxy<N["drivers"][number]>[];
      },
    };
  }

  private getDriverPath<Path extends Rpc.Client.Path<N>>(
    path: Path,
  ): Rpc.Client.Result<N, Path> {
    if (path.startsWith("/")) {
      // TSAS: The slash prefix identifies a group path at runtime.
      return this.getGroup(path as Natav.GroupPaths<N["input"]>) as
        Rpc.Client.Result<N, Path>;
    }
    // TSAS: Non-group static paths are driver names from the runtime type.
    return this.getDriver(path as Natav.Names<N["drivers"]>) as unknown as
      Rpc.Client.Result<N, Path>;
  }

  readonly find: Rpc.Client.Find<N> = {
    driver: <Cast = never, Path extends string = string>(path: Path) => {
      const result = path.startsWith("/") ?
        this.getDynamicGroup(path)
      : this.getDriver(path as Natav.Names<N["drivers"]>);
      // TSAS: The slash prefix selects groups; explicit Cast overrides the fallback proxy type.
      return result as unknown as Cast;
    },
    plugin: <Cast = Natav.Shape>(path: string): Cast => {
      // TSAS: The caller supplies the structural type implemented by this runtime proxy.
      return this.getPlugin(path) as unknown as Cast;
    },
  };

  drivers(): Rpc.Client.Group<N, ""> {
    return {
      array: () =>
        this.driverNames.map((name) =>
          this.getDriver(name as Natav.Names<N["drivers"]>),
        ) as unknown as Rpc.Proxy<N["drivers"][number]>[],
    };
  }

  plugins(): Rpc.Client.Group<N, ""> {
    return {
      array: () =>
        this.pluginNames.map((name) =>
          this.getPlugin(name as Natav.Names<N["plugins"]>),
        ) as unknown as Rpc.Proxy<N["drivers"][number]>[],
    };
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

    for (const [name, state] of Object.entries(result.states.drivers)) {
      // TSAS: driver names from server response are guaranteed to match registered drivers
      const driver = this.getDriver(name as Natav.Names<N["drivers"]>);
      driver.handleStateUpdate(
        // TSAS: The init response state belongs to this catalog entry.
        state as Natav.State<N["drivers"], Natav.Names<N["drivers"]>>,
      );
    }

    for (const [name, state] of Object.entries(result.states.plugins)) {
      const plugin = this.getPlugin(name as Natav.Names<N["plugins"]>);
      plugin.handleStateUpdate(
        // TSAS: plugin names and states come from the server's plugin catalog.
        state as Natav.State<N["plugins"], Natav.Names<N["plugins"]>>,
      );
    }

    this.driverNames = result.names;
    this.groupCatalog = new Map(Object.entries(result.groups));
    this.pluginNames = result.plugins;

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

      let driver: ClientRpcDriver<N, N["drivers"], Natav.Names<N["drivers"]>>;

      switch (notification.type) {
        case "natav:driver:event":
          // TSAS: Server notifications are restricted to the registered driver catalog at runtime.
          driver = this.getDriver(
            notification.params.name as Natav.Names<N["drivers"]>,
          );
          driver.handleEvent(
            notification.params.event,
            notification.params.data,
          );
          break;
        case "natav:state:update":
          // TSAS: Server notifications are restricted to the registered driver catalog at runtime.
          driver = this.getDriver(
            notification.params.name as Natav.Names<N["drivers"]>,
          );
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
