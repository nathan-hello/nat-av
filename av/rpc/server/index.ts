import {
  RPCError,
  RPCErrorCodes,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import type { System } from "@av/system";
import { Telemetry } from "@av/telemetry";
import type { Events, Natav } from "@av/types";

import { TypedEventTarget } from "@av/lib/eventtarget";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { RPCRequestRouter } from "@av/rpc/server/router";
import { SystemRpcRouter } from "@av/rpc/server/system";
import type { WebSocketPeer } from "@av/rpc/server/websocket";

export class RPCServer<N extends Natav.Orch> extends TypedEventTarget<
  Events.System.Map<N>
> {
  private tel = new Telemetry("Rpc");
  private router: RPCRequestRouter<N>;

  constructor(args: { system: System<N>; natav: N }) {
    super();
    this.router = new RPCRequestRouter<N>([
      new SystemRpcRouter(args.system),
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
