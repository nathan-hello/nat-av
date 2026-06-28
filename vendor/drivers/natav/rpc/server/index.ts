import type { Manager } from "@av/index";
import { Driver, Err, type Events, TypedEventTarget } from "@av/index";
import { Rpc } from "../types";
import { RpcPeerRegistry } from "./registry";
import type { ServerRpcTransport } from "./websocket";

function hasJsonEventTarget(
  value: unknown,
): value is TypedEventTarget<Record<string, Rpc.Json.Value>> {
  return (
    typeof value === "object" &&
    value !== null &&
    "on" in value &&
    // TSAS: We only need the runtime `on` slot to validate the event target shape.
    typeof (value as { on?: unknown }).on === "function"
  );
}

export class RpcServer<
  ContextType extends Rpc.Server.Context = Rpc.Server.Context,
> extends Driver<"rpc-server"> {
  private peers: RpcPeerRegistry<ContextType>;
  private clients = new Set<Rpc.WebSocket.Peer>();
  private subscriptions = new Map<
    Rpc.WebSocket.Peer,
    Map<string, Array<() => void>>
  >();

  state = {};
  api = {
    whoami: (): ContextType => {},
  };

  public override start() {
    this.transport.listen();
  }

  constructor(
    private natav: Manager,
    private transport: ServerRpcTransport,
    private peerToContext?: (peer: Rpc.WebSocket.Peer) => ContextType,
  ) {
    super({ name: "rpc-server" });
    this.peers = new RpcPeerRegistry<ContextType>(peerToContext);

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

    transport.on("error", () => {});
  }

  async handleRequest(
    message: Rpc.Request,
    peer: Rpc.WebSocket.Peer,
  ): Promise<Rpc.Response | Rpc.Error> {
    let context: ContextType;

    try {
      context = this.peers.get(peer);
    } catch (error) {
      return new Rpc.Error(
        error instanceof Error ? error : new Error("unknown error"),
        message.id,
      );
    }

    const result = await this.tel.task("handlerequest", async (span) => {
      span.setAttributes({
        "rpc.id": message.id,
        "rpc.method": message.method,
      });

      if (message.method === Rpc.Request.Methods.DriverInit) {
        return this.handleInit(message, peer);
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

    return new Rpc.Error(result.error, message?.id);
  }

  private closePeer(peer: Rpc.WebSocket.Peer) {
    this.clients.delete(peer);
    this.peers.close(peer);

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

  private handleInit(
    message: Rpc.Request,
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Response | Rpc.Error {
    const states: Record<string, unknown> = {};
    for (const name of this.natav.GetAllDriverNames()) {
      states[name] = this.natav.GetDriver(name).state;
    }

    const tree = this.natav.GetTree();
    const names = this.natav.GetAllDriverNames();

    const context = this.peers.get(peer);

    const stateIsGood = Rpc.Json.is(states);
    if (stateIsGood) {
      return message.response({ context, states, tree, names });
    } else {
      return message.error({
        code: Err.Codes.JsonStringifyFailed,
        message:
          "no state was sent because at least one state was not json stringifyable",
      });
    }
  }

  private async handleSocketMessage(peer: Rpc.WebSocket.Peer, raw: string) {
    const message = this.tel.task("WS_MSG_JSON_PARSE", () =>
      Rpc.Json.parse(raw),
    );

    if (!message.ok) {
      peer.send(Rpc.Json.stringify(new Rpc.Error(message.error)));
      return;
    }

    const req = Rpc.Request.is(message.data);
    if (!req) {
      const requestId =
        (
          message.data &&
          typeof message.data === "object" &&
          !Array.isArray(message.data) &&
          "id" in message.data &&
          (typeof message.data.id === "string" ||
            typeof message.data.id === "number")
        ) ?
          message.data.id.toString()
        : "UNKNOWN_REQUEST_ID";

      peer.send(
        Rpc.Json.stringify(
          new Rpc.Error(
            {
              code: Err.Codes.RpcInvalidRequestObject,
              message: "got_unknown_message",
            },
            requestId,
          ),
        ),
      );
      return;
    }

    const response = await this.handleRequest(req, peer);
    peer.send(Rpc.Json.stringify(response));
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
        message.id,
      );
    }

    const result = await this.tel.task(
      `driver:${params.driver}.${params.method}`,
      async (span) => {
        span.setAttributes({
          "driver.name": params.driver,
          "driver.method": params.method,
        });

        const driver = this.natav.FindDriver(params.driver);
        if (!driver) {
          return new Rpc.Error(
            {
              code: Err.Codes.DriverNotFound,
              message: `Driver \"${params.driver}\" not found`,
              data: { availableDriver: this.natav.GetAllDriverNames() },
            },
            message.id,
          );
        }
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
              message.id,
            );
        }
      },
    );

    if (result.ok) {
      return result.data;
    } else {
      return new Rpc.Error(result.error, message.id);
    }
  }

  private subscribeDriver(
    driver: Driver,
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
    driver: Driver,
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
        message.id,
      );
    }

    const result = await this.tel.task("api_call", async () => {
      return await Reflect.apply(method.fn, method.target, params.args);
    });

    if (result.ok) {
      if (result.data instanceof Error) {
        return new Rpc.Error(result.data, message.id);
      }
      if (result.data instanceof Rpc.Error) {
        result.data.id = message.id;
        return result.data;
      }
      if (Rpc.Json.is(result.data)) {
        return message.response(result.data);
      }
      return new Rpc.Error({
        code: Err.Codes.JsonStringifyFailed,
        message: "non-stringifyable response from api",
      });
    } else {
      return new Rpc.Error(result.error, message.id);
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
