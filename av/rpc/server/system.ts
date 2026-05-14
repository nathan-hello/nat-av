import type { natav } from "@av/index";
import type Natav from "@av/natav";
import { parseSystemApiParams } from "@av/rpc/protocol";
import { RPCMethods, type NatavRPCRequest, type RPCError, type RPCResponse } from "@av/rpc/types";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import type { System } from "@av/system";
import { Telemetry } from "@av/telemetry";
import { createRPCError, createRPCResponse, RPCErrorCode } from "@av/rpc/utils";

export class SystemRpcRouter<N extends Natav = natav> implements RPCRequestHandler {
  prefix = "system.";
  private tel = new Telemetry("SystemRpcRouter");

  constructor(private system: System<N>) {}

  async handle(message: NatavRPCRequest): Promise<RPCResponse | RPCError> {
    switch (message.method) {
      case RPCMethods.SystemState:
        return createRPCResponse(message.id, this.system.state);
      case RPCMethods.SystemApi:
        return this.handleApiCall(message);
      default:
        return createRPCError(message.id, RPCErrorCode.MethodNotFound, message.method);
    }
  }

  private async handleApiCall(message: NatavRPCRequest): Promise<RPCResponse | RPCError> {
    const params = parseSystemApiParams(message);
    if (!params) {
      return createRPCError(message.id, RPCErrorCode.InvalidParams, "Invalid system api params");
    }

    const result = await this.tel.task(`system:${params.method}`, async () => {
      const method = this.system.api[params.method as keyof typeof this.system.api];
      if (typeof method !== "function") {
        return createRPCError(
          message.id,
          RPCErrorCode.MethodNotFound,
          `Unknown system API method: \"${params.method}\"`,
        );
      }

      const value = await Reflect.apply(method, this.system.api, params.args);
      return createRPCResponse(message.id, value);
    });

    if (result.ok) {
      return result.data;
    }

    if (result.data) {
      return createRPCError(
        message.id,
        result.data.error.code,
        result.data.error.message,
        result.data.error.data,
      );
    }

    return createRPCError(message.id, RPCErrorCode.InternalError, result.error);
  }
}
