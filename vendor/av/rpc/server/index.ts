import type { Manager } from "@av/drivers";
import {
  RPCError,
  RPCErrorCodes,
  RPCErrors,
  RPCRequest,
  RPCResponse,
  RPCServerNotification,
} from "@av/rpc/protocol";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { Telemetry } from "@av/telemetry";
import { Rpc } from "@av/types";
import type { ServerRpcTransport } from "@av/rpc/server/websocket";

export class RPCServer {
  private tel = new Telemetry("Rpc");
  private router: DeviceRpcRouter;
  private clients = new Set<Rpc.WebSocket.Peer>();

  constructor(args: { natav: Manager; transport: ServerRpcTransport }) {
    this.router = new DeviceRpcRouter(args.natav);

    args.natav.bus.on("natav:state:update", (payload) => {
      this.broadcast(
        JSON.stringify(
          new RPCServerNotification("natav:state:update", payload),
        ),
      );
    });

    args.natav.bus.on("natav:device:connected", (payload) => {
      this.broadcast(
        JSON.stringify(
          new RPCServerNotification("natav:device:connected", payload),
        ),
      );
    });

    args.natav.bus.on("natav:device:disconnected", (payload) => {
      this.broadcast(
        JSON.stringify(
          new RPCServerNotification("natav:device:disconnected", payload),
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
    message: RPCRequest,
    peer: Rpc.WebSocket.Peer,
  ): Promise<RPCResponse | RPCError> {
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

        if (message.method === Rpc.Methods.GetAllDriverStates) {
          
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

    return new RPCError(message?.id ?? null, {
      code: RPCErrorCodes.InternalError,
      message: result.error,
    });
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
    const message = this.tel.task("WS_MSG_JSON_PARSE", () => JSON.parse(raw));

    if (!message.ok) {
      peer.send(JSON.stringify(RPCErrors.JsonParse()));
      return;
    }

    const req = RPCRequest.is(message.data);
    if (!req) {
      peer.send(
        JSON.stringify(
          RPCErrors.RequestInvalid(
            "id" in message.data ? message.data.id : null,
            message.data,
          ),
        ),
      );
      return;
    }

    const response = await this.handleRequest(req, peer);
    peer.send(JSON.stringify(response));
  }

  private pushInitialDeviceStates(natav: Manager, ws: Rpc.WebSocket.Peer) {
    for (const name of natav.GetAllDriverNames()) {
      ws.send(
        JSON.stringify(
          new RPCServerNotification("natav:state:update", {
            name,
            data: natav.GetDriverState(name),
          }),
        ),
      );
    }
  }
}
