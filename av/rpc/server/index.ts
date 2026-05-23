import type {Natav} from "@av/types";
import type { System } from "@av/system";
import { RPCResponse, RPCError, RPCRequest } from "@av/rpc/protocol";
import { RPCErrorCodes } from "@av/rpc/protocol";
import { Telemetry } from "@av/telemetry";
import type { natav } from "@av/index";

import { DeviceRpcRouter } from "@av/rpc/server/device";
import { RPCRequestRouter } from "@av/rpc/server/router";
import { SystemRpcRouter } from "@av/rpc/server/system";

export class RPCServer<N extends Natav.Orch = natav> {
  private tel = new Telemetry("Rpc");
  private router: RPCRequestRouter;

  constructor(args: { system: System<N>; natav: N }) {
    this.router = new RPCRequestRouter([
      new SystemRpcRouter(args.system),
      new DeviceRpcRouter(args.natav),
    ]);
  }

  async handleRequest(message: RPCRequest): Promise<RPCResponse | RPCError> {
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

        this.tel.info("RPC_VALIDATED", { message });
        return this.router.handle(message);
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
}
