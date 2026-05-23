import type { natav } from "@av/index";
import type Natav from "@av/natav";
import {
  RPCMethods,
  RPCRequest,
  RPCError,
  RPCResponse,
} from "@av/rpc/protocol";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import type { System } from "@av/system";
import { Telemetry } from "@av/telemetry";
import { RPCErrorCodes } from "@av/rpc/protocol";

export class SystemRpcRouter<
  N extends Natav = natav,
> implements RPCRequestHandler {
  prefix = "system.";
  private tel = new Telemetry("Rpc::Router::System");

  constructor(private system: System<N>) {}

  async handle(message: RPCRequest): Promise<RPCResponse | RPCError> {
    switch (message.method) {
      case RPCMethods.SystemState:
        return new RPCResponse(message.id, this.system.state);
      case RPCMethods.SystemApi:
        return this.handleApiCall(message);
      default:
        return new RPCError(message.id, {
          code: RPCErrorCodes.MethodNotFound,
          message: message.method,
        });
    }
  }

  private async handleApiCall(
    message: RPCRequest,
  ): Promise<RPCResponse | RPCError> {
    const params = message.systemApiParams();
    if (!params) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid system api params",
      });
    }

    const result = await this.tel.task(`system:${params.method}`, async () => {
      // TSAS:
      const method =
        this.system.api[params.method as keyof typeof this.system.api];
      if (typeof method !== "function") {
        return new RPCError(message.id, {
          code: RPCErrorCodes.MethodNotFound,
          message: `Unknown system API method: \"${params.method}\"`,
        });
      }

      const value = await Reflect.apply(method, this.system.api, params.args);
      return new RPCResponse(message.id, value === undefined ? null : value);
    });

    if (result.ok) {
      return result.data;
    }

    if (result.data) {
      return new RPCError(message.id, result.data.error);
    }

    return new RPCError(message.id, {
      code: RPCErrorCodes.InternalError,
      message: result.error,
    });
  }
}
