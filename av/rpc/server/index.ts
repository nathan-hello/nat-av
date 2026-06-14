import type { Manager } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import {
  RPCError,
  RPCErrorCodes,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { RPCRequestRouter } from "@av/rpc/server/router";
import type { WebSocketPeer } from "@av/rpc/server/websocket";
import { Telemetry } from "@av/telemetry";
import type { Drivers, Events } from "@av/types";

export class RPCServer<N extends Drivers.Array> extends TypedEventTarget<
  Events.Natav.Map<N>
> {
  private tel = new Telemetry("Rpc");
  private router: RPCRequestRouter<N>;

  constructor(args: { natav: Manager<N> }) {
    super();
    this.router = new RPCRequestRouter<N>([
      // new SystemRpcRouter(args.system),
      new DeviceRpcRouter(args.natav),
    ]);
  }

  async handleRequest(
    message: RPCRequest,
    peer: WebSocketPeer,
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
      // TSAS:
      id: (message as any)?.id,
    });

    return new RPCError(message?.id ?? null, {
      code: RPCErrorCodes.InternalError,
      message: result.error,
    });
  }

  closePeer(peer: WebSocketPeer) {
    this.router.closePeer(peer);
  }
}
