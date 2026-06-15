import type { Manager } from "@av/drivers";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import type { ServerRpcTransport } from "@av/rpc/server/websocket";
import { Telemetry } from "@av/telemetry";
import { Rpc } from "@av/types";

export class RPCServer {
  private tel = new Telemetry("Rpc");
  private router: DeviceRpcRouter;
  private clients = new Set<Rpc.WebSocket.Peer>();

  constructor(args: { natav: Manager; transport: ServerRpcTransport }) {
    this.router = new DeviceRpcRouter(args.natav);

    args.natav.bus.on("natav:state:update", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:state:update", payload),
        ),
      );
    });

    args.natav.bus.on("natav:device:connected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:device:connected", payload),
        ),
      );
    });

    args.natav.bus.on("natav:device:disconnected", (payload) => {
      this.broadcast(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:device:disconnected", payload),
        ),
      );
    });

    args.transport.on("open", ({ peer }) => {
      this.clients.add(peer);
      this.pushInitialDeviceStates(args.natav, peer);
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
    const result = await this.tel.task(
      "server-rpc:handle-request",
      async (span) => {
        this.tel.info("RPC_RECEIVED", {
          jsonrpc: message.jsonrpc,
          id: message.id,
          method: message.method,
        });

        span.setAttributes({
          "rpc.id": message.id,
          "rpc.method": message.method,
        });

        if (message.method === Rpc.Request.Methods.GetAllDriverStates) {
        }

        return this.router.handle(message, peer);
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

  private pushInitialDeviceStates(natav: Manager, ws: Rpc.WebSocket.Peer) {
    for (const name of natav.GetAllDriverNames()) {
      ws.send(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:state:update", {
            name,
            data: natav.GetDriverState(name),
          }),
        ),
      );
    }
  }
}
