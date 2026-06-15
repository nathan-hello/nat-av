import type { Manager } from "@av/drivers";
import {
  RPCError,
  RPCErrorCodes,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { Telemetry } from "@av/telemetry";
import type { Rpc } from "@av/types";

export class RPCServer {
  private tel = new Telemetry("Rpc");
  private router: DeviceRpcRouter;

  constructor(args: { natav: Manager }) {
    this.router = new DeviceRpcRouter(args.natav);
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
    this.router.closePeer(peer);
  }
}
