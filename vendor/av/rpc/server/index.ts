import type { Manager } from "@av/drivers";
import { DriverRpcRouter } from "@av/rpc/server/driver";
import { RpcPeerRegistry } from "@av/rpc/server/registry";
import type { ServerRpcTransport } from "@av/rpc/server/websocket";
import { Telemetry } from "@av/telemetry";
import { Rpc } from "@av/types";

export class RpcServer<
  ContextType extends Rpc.Server.Context = Rpc.Server.Context,
> {
  private tel = new Telemetry("Rpc");
  private router: DriverRpcRouter;
  private peers: RpcPeerRegistry<ContextType>;
  private clients = new Set<Rpc.WebSocket.Peer>();
  private natav: Manager<any, any, ContextType>;

  constructor(args: {
    natav: Manager<any, any, ContextType>;
    transport: ServerRpcTransport;
    peerToContext?: (peer: Rpc.WebSocket.Peer) => ContextType;
  }) {
    this.natav = args.natav;
    this.router = new DriverRpcRouter(args.natav);
    this.peers = new RpcPeerRegistry<ContextType>(args.peerToContext);

    args.natav.bus.on("natav:state:update", (payload) => {
      this.broadcastState(payload.name);
    });

    args.natav.bus.on("natav:driver:connected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:connected", payload),
        ),
      );
    });

    args.natav.bus.on("natav:driver:disconnected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:disconnected", payload),
        ),
      );
    });

    args.transport.on("open", ({ peer }) => {
      try {
        const context = this.peers.open(peer);
        this.clients.add(peer);
        this.pushPeerContext(peer, context);
      } catch (error) {
        this.tel.error("websocket peer rejected", { error, addr: peer.addr });
        peer.close(
          1008,
          error instanceof Error ? error.message : "peer rejected",
        );
        return;
      }
    });

    args.transport.on("message", ({ peer, data }) => {
      void this.handleSocketMessage(peer, data);
    });

    args.transport.on("close", ({ peer, code, reason }) => {
      this.tel.info("websocket closed", {
        code,
        reason,
      });
      this.closePeer(peer);
    });

    args.transport.on("error", () => {});

    args.transport.listen();
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
        {
          code: Rpc.Error.Codes.InternalError,
          message:
            error instanceof Error ? error.message : "missing peer context",
        },
        message.id,
      );
    }

    const result = await this.tel.task(
      "server-rpc:handle-request",
      async (span) => {
        return this.natav.runWithContext(context, async () => {
          this.tel.info("RPC_RECEIVED", {
            jsonrpc: message.jsonrpc,
            id: message.id,
            method: message.method,
          });

          span.setAttributes({
            "rpc.id": message.id,
            "rpc.method": message.method,
          });

          if (message.method === Rpc.Request.Methods.DriverInit) {
            return this.handleInit(message);
          }

          return this.router.handle(message, peer);
        });
      },
    );

    if (result.ok) {
      return result.data;
    }

    this.tel.error("RPC_INTERNAL_ERROR", {
      error: result.error,
      id: message.id,
    });

    return new Rpc.Error(
      { code: Rpc.Error.Codes.InternalError, message: result.error },
      message?.id,
    );
  }

  closePeer(peer: Rpc.WebSocket.Peer) {
    this.clients.delete(peer);
    this.peers.close(peer);
    this.router.closePeer(peer);
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

    const context = this.peers.get(peer);
    this.natav.runWithContext(context, () => {
      peer.send(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:state:update", {
            name,
            data: this.natav.GetDriver(name).state,
          }),
        ),
      );
    });
  }

  private pushPeerContext(
    peer: Rpc.WebSocket.Peer,
    context: ContextType,
  ) {
    peer.send(
      Rpc.Json.stringify(new Rpc.Notification.Server("natav:peer", context)),
    );
  }

  private handleInit(message: Rpc.Request): Rpc.Response {
    const context = this.natav.GetContext();
    const states: Record<string, unknown> = {};
    for (const name of this.natav.GetAllDriverNames()) {
      states[name] = this.natav.GetDriver(name).state;
    }
    // TSAS: Driver states and context are JSON-serializable for RPC transport.
    return message.response({ context, states } as Rpc.Json.Value);
  }

  private async handleSocketMessage(peer: Rpc.WebSocket.Peer, raw: string) {
    const message = this.tel.task("WS_MSG_JSON_PARSE", () =>
      Rpc.Json.parse(raw),
    );

    if (!message.ok) {
      peer.send(
        Rpc.Json.stringify(
          new Rpc.Error({
            code: Rpc.Error.Codes.InternalError,
            message: "json stringify",
          }),
        ),
      );
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
              code: Rpc.Error.Codes.InvalidRequest,
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

}
