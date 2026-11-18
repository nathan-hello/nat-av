import { Natav, Err, type Events, TypedEventTarget } from "../../index.js";
import { Rpc } from "../types.js";
import type { ServerRpcTransport } from "./transport.js";
export type {
  ServerRpcTransport,
  ServerRpcTransportEvents,
} from "./transport.js";

function hasJsonEventTarget(
  value: unknown,
): value is TypedEventTarget<Record<string, Rpc.Json.Value>> {
  return (
    typeof value === "object" &&
    value !== null &&
    "on" in value &&
    typeof value.on === "function"
  );
}

function errorResponse(error: Rpc.Error): Rpc.Error.Response {
  const cause = error.cause;
  const payload = isObject(cause) ? cause : undefined;
  const code = typeof payload?.code === "number" ? payload.code : -99999;
  const message =
    typeof payload?.message === "string" ? payload.message : error.message;
  const data =
    payload && "data" in payload ? payload.data
    : isObject(cause) ? cause
    : undefined;

  return {
    jsonrpc: "2.0",
    id: error.id,
    error: {
      code,
      message,
      ...(Rpc.Json.is(data) ? { data } : {}),
      scope: error.origin.scope,
      ...(error.origin.name ? { name: error.origin.name } : {}),
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class RpcServer extends Natav.Plugin<"rpc-server"> {
  private clients = new Set<Rpc.WebSocket.Peer>();
  private subscriptions = new Map<
    Rpc.WebSocket.Peer,
    Map<string, Array<() => void>>
  >();

  state = {};
  api = {};

  public override start() {
    if (!this.transport) {
      throw new Error("RpcServer transport has not been attached");
    }
    this.transport.listen();
  }

  private transport: ServerRpcTransport | undefined;

  constructor(
    private natav: Natav,
    transport?: ServerRpcTransport,
  ) {
    super({ name: "rpc-server" });

    natav.bus.on("natav:state:update", (payload) => {
      this.broadcastState(payload.name);
    });

    natav.bus.on("natav:driver:connected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:connected", payload),
        ),
      );
    });

    natav.bus.on("natav:driver:disconnected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:disconnected", payload),
        ),
      );
    });

    if (transport) {
      this.attachTransport(transport);
    }
  }

  attachTransport(transport: ServerRpcTransport) {
    this.transport = transport;

    transport.on("open", ({ peer }) => {
      const result = this.tel.task("add peer", () => {
        this.clients.add(peer);
      });

      if (!result.ok) {
        this.tel.error("websocket peer rejected", {
          error: result.error,
          addr: peer.addr,
        });
      }
    });

    transport.on("message", ({ peer, data }) => {
      void this.handleSocketMessage(peer, data);
    });

    transport.on("close", ({ peer, code, reason }) => {
      this.tel.info("websocket closed", {
        code,
        reason,
      });
      this.closePeer(peer);
    });

    transport.on("error", ({ peer, error }) => {
      this.tel.error("transport got error", { error, peer: peer.addr });
    });
  }

  async handleRequest(
    message: Rpc.Request,
    peer: Rpc.WebSocket.Peer,
  ): Promise<Rpc.Response | Rpc.Error> {
    const result = await this.tel.task("handlerequest", async (span) => {
      span.setAttributes({
        "rpc.id": message.id,
        "rpc.method": message.method,
      });

      if (message.method === Rpc.Request.Methods.DriverInit) {
        return this.handleInit(message);
      }
      if (message.method === Rpc.Request.Methods.CatalogList) {
        return this.handleCatalogList(message);
      }
      return this.handleDriverRequest(message, peer);
    });

    if (result.ok) {
      return result.data;
    }

    this.tel.error("RPC_INTERNAL_ERROR", {
      error: result.error,
      id: message.id,
    });

    return new Rpc.Error(
      result.error,
      { scope: "server" },
      message?.id ?? null,
    );
  }

  private closePeer(peer: Rpc.WebSocket.Peer) {
    this.clients.delete(peer);

    const peerSubscriptions = this.subscriptions.get(peer);
    if (peerSubscriptions) {
      peerSubscriptions.forEach((cleanups) =>
        cleanups.forEach((cleanup) => cleanup()),
      );
      this.subscriptions.delete(peer);
    }
  }

  private broadcast(message: string) {
    this.clients.forEach((peer) => {
      if (peer.readyState !== 1) {
        return;
      }

      peer.send(message);
    });
  }

  private broadcastState(name: string) {
    this.clients.forEach((peer) => this.sendStateToPeer(peer, name));
  }

  private sendStateToPeer(peer: Rpc.WebSocket.Peer, name: string) {
    if (peer.readyState !== 1) {
      return;
    }
    peer.send(
      Rpc.Json.stringify(
        new Rpc.Notification.Server("natav:state:update", {
          name,
          data: this.natav.GetDriver(name).state,
        }),
      ),
    );
  }

  private handleInit(message: Rpc.Request): Rpc.Response | Rpc.Error {
    const driverStates: Record<string, unknown> = {};
    for (const name of this.natav.GetAllDriverNames()) {
      driverStates[name] = this.natav.GetDriver(name).state;
    }
    const pluginStates: Record<string, unknown> = {};
    for (const name of this.natav.GetAllPluginNames()) {
      pluginStates[name] = this.natav.Get(name).state;
    }

    const states = { drivers: driverStates, plugins: pluginStates };
    const names = this.natav.GetAllDriverNames();
    const groups = Object.fromEntries(
      this.natav
        .GetAllGroupPaths()
        .map((path) => [
          path,
          (this.natav.FindGroup(path) ?? [])
            .filter((entry) => this.natav.FindDriver(entry.name))
            .map((entry) => entry.name),
        ]),
    );
    const stateIsGood = Rpc.Json.is(states);
    if (stateIsGood) {
      return message.response({
        states,
        names,
        groups,
        plugins: this.natav.GetAllPluginNames(),
      });
    } else {
      return message.error({
        code: Err.Codes.JsonStringifyFailed,
        message:
          "no state was sent because at least one state was not json stringifyable",
      });
    }
  }

  private handleCatalogList(message: Rpc.Request): Rpc.Response | Rpc.Error {
    const params = message.params;
    if (
      !params ||
      typeof params !== "object" ||
      Array.isArray(params) ||
      !("path" in params) ||
      typeof params.path !== "string"
    ) {
      return message.error({
        code: Err.Codes.RpcInvalidParams,
        message: "Invalid group path",
      });
    }

    return message.response(
      (this.natav.FindGroup(params.path) ?? [])
        .filter((entry) => this.natav.FindDriver(entry.name))
        .map((entry) => ({ name: entry.name })),
    );
  }

  private async handleSocketMessage(peer: Rpc.WebSocket.Peer, raw: string) {
    const message = this.tel.task("WS_MSG_JSON_PARSE", () =>
      Rpc.Json.parse(raw),
    );

    if (!message.ok) {
      peer.send(
        Rpc.Json.stringify(
          errorResponse(
            new Rpc.Error(message.error, { scope: "server" }, null),
          ),
        ),
      );
      return;
    }

    const req = Rpc.Request.is(message.data);
    if (!req) {
      const requestId: Rpc.Id | null =
        (
          message.data &&
          typeof message.data === "object" &&
          !Array.isArray(message.data) &&
          "id" in message.data &&
          (typeof message.data.id === "string" ||
            typeof message.data.id === "number")
        ) ?
          message.data.id
        : null;

      peer.send(
        Rpc.Json.stringify(
          errorResponse(
            new Rpc.Error(
              {
                code: Err.Codes.RpcInvalidRequestObject,
                message: "got_unknown_message",
              },
              { scope: "server" },
              requestId,
            ),
          ),
        ),
      );
      return;
    }

    const response = await this.handleRequest(req, peer);
    peer.send(
      Rpc.Json.stringify(
        response instanceof Rpc.Error ? errorResponse(response) : response,
      ),
    );
  }

  private async handleDriverRequest(
    message: Rpc.Request,
    peer: Rpc.WebSocket.Peer,
  ): Promise<Rpc.Response | Rpc.Error> {
    const params = message.DriverParams();

    if (!params) {
      return new Rpc.Error(
        {
          code: Err.Codes.RpcInvalidParams,
          message: "Invalid driver call params",
        },
        { scope: "server" },
        message.id,
      );
    }

    let origin: Rpc.Error.Origin = { scope: "server" };
    const result = await this.tel.task(
      `driver:${params.driver}.${params.method}`,
      async (span) => {
        span.setAttributes({
          "driver.name": params.driver,
          "driver.method": params.method,
        });

        let driver: Natav.Shape;
        try {
          driver = this.natav.Get(params.driver);
        } catch {
          return new Rpc.Error(
            {
              code: Err.Codes.DriverNotFound,
              message: `Natav.Driver \"${params.driver}\" not found`,
              data: {
                availableDriver: [
                  ...this.natav.GetAllDriverNames(),
                  ...this.natav.GetAllPluginNames(),
                ],
              },
            },
            { scope: "natav" },
            message.id,
          );
        }
        if (!driver) {
          return new Rpc.Error(
            {
              code: Err.Codes.DriverNotFound,
              message: `Natav.Driver \"${params.driver}\" not found`,
              data: { availableDriver: this.natav.GetAllDriverNames() },
            },
            { scope: "natav" },
            message.id,
          );
        }
        origin = { scope: driver.scope, name: driver.name };
        switch (message.method) {
          case Rpc.Request.Methods.DriverCall:
            return await this.callDriverApi(driver, message, params);
          case Rpc.Request.Methods.DriverSubscribe:
            return this.subscribeDriver(driver, message, params, peer);
          case Rpc.Request.Methods.DriverUnsubscribe:
            return this.unsubscribeDriver(message, params, peer);
          default:
            return new Rpc.Error(
              {
                code: Err.Codes.RpcInvalidParams,
                message: "Invalid driver call params",
              },
              { scope: "server" },
              message.id,
            );
        }
      },
    );

    if (result.ok) {
      return result.data;
    } else {
      this.natav.bus.dispatch("natav:driver:error", {
        caughtBy: this.name,
        name: params.driver,
        error: result.error,
      });
      return new Rpc.Error(result.error, origin, message.id);
    }
  }

  private subscribeDriver(
    driver: Natav.Shape,
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Response | Rpc.Error {
    const eventName = params.method;

    const events: unknown = driver.events;

    if (!hasJsonEventTarget(events)) {
      return new Rpc.Error(
        {
          code: Err.Codes.RpcInvalidParams,
          message: "driver did not implement events",
        },
        { scope: "server" },
        message.id,
      );
    }

    const cleanup = events.on(eventName, (data) => {
      if (peer.readyState !== 1) {
        return;
      }

      const event: Events.Natav.Map["natav:driver:event"] = {
        name: driver.name,
        event: eventName,
        data,
      };

      peer.send(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:event", event),
        ),
      );
    });

    const peerSubscriptions =
      this.subscriptions.get(peer) ?? new Map<string, Array<() => void>>();
    const handlers = peerSubscriptions.get(eventName) ?? [];
    handlers.push(cleanup);
    peerSubscriptions.set(eventName, handlers);
    this.subscriptions.set(peer, peerSubscriptions);

    return message.response(null);
  }

  private unsubscribeDriver(
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Response | Rpc.Error {
    const eventName = params.method;

    const peerSubscriptions = this.subscriptions.get(peer);
    const handlers = peerSubscriptions?.get(eventName);
    const cleanup = handlers?.pop();
    if (cleanup) {
      cleanup();
      if (handlers && handlers.length === 0) {
        peerSubscriptions?.delete(eventName);
      }
      if (peerSubscriptions && peerSubscriptions.size === 0) {
        this.subscriptions.delete(peer);
      }
    }

    return message.response(null);
  }

  private async callDriverApi(
    driver: Natav.Shape,
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
  ): Promise<Rpc.Response | Rpc.Error> {
    const method = this.resolveApiMethod(driver.api, params.method);

    if (!method) {
      return new Rpc.Error(
        {
          code: Err.Codes.DriverMethodNotFound,
          message: `Method \"${params.method}\" not found on driver \"${params.driver}\"`,
          data: { availableMethods: Object.keys(driver.api ?? {}) },
        },
        { scope: "server" },
        message.id,
      );
    }

    const result = await this.tel.task("api_call", async () => {
      return await Reflect.apply(method.fn, method.target, params.args);
    });

    if (result.ok) {
      if (result.data instanceof Error) {
        return new Rpc.Error(
          result.data,
          { scope: driver.scope, name: driver.name },
          message.id,
        );
      }
      if (result.data instanceof Rpc.Error) {
        return new Rpc.Error(result.data.cause, result.data.origin, message.id);
      }
      if (Rpc.Json.is(result.data)) {
        return message.response(result.data);
      }
      return new Rpc.Error(
        {
          code: Err.Codes.JsonStringifyFailed,
          message: "non-stringifyable response from api",
        },
        { scope: driver.scope, name: driver.name },
        message.id,
      );
    } else {
      return new Rpc.Error(
        result.error,
        { scope: driver.scope, name: driver.name },
        message.id,
      );
    }
  }

  private resolveApiMethod(
    api: unknown,
    methodPath: string,
  ): { fn: (...args: unknown[]) => unknown; target: unknown } | null {
    const segments = methodPath.split("/").filter(Boolean);
    let target: any = api;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      if (target === null || target === undefined) {
        return null;
      }

      const next = target[segment];
      if (next === undefined) {
        return null;
      }

      if (i === segments.length - 1) {
        if (typeof next !== "function") {
          return null;
        }

        return { fn: next, target };
      }

      target = next;
    }

    return null;
  }
}
