import type { natav } from "@av/index";
import type Natav from "@av/natav";
import { RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import { Telemetry } from "@av/telemetry";
import { RPCErrorCodes } from "@av/rpc/protocol";

export class DeviceRpcRouter<N extends Natav = natav> implements RPCRequestHandler {
  prefix = "device.";
  private tel = new Telemetry("DeviceRpcRouter");

  constructor(private natav: N) {}

  async handle(message: RPCRequest): Promise<RPCResponse | RPCError> {
    const params = message.deviceCallParams();
    if (!params) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid device call params",
      });
    }

    const result = await this.tel.task(`device:${params.device}.${params.method}`, async (span) => {
      span.setAttributes({
        "device.name": params.device,
        "device.method": params.method,
      });

      const device = this.natav.FindDriver(params.device);
      if (!device) {
        return new RPCError(message.id, {
          code: RPCErrorCodes.DeviceNotFound,
          message: `Device \"${params.device}\" not found`,
          data: { availableDevices: this.natav.GetAllDriverNames() },
        });
      }

      const method = (device.api as Record<string, unknown> | undefined)?.[params.method];
      if (typeof method !== "function") {
        return new RPCError(message.id, {
          code: RPCErrorCodes.DeviceMethodNotFound,
          message: `Method \"${params.method}\" not found on device \"${params.device}\"`,
          data: { availableMethods: Object.keys(device.api ?? {}) },
        });
      }

      const callResult = await Reflect.apply(method, device.api, params.args);
      if (callResult && typeof callResult === "object" && "error" in callResult) {
        const error = (callResult as { error?: { code?: number; message?: string; data?: any } })
          .error;
        if (error && typeof error.code === "number" && typeof error.message === "string") {
          return new RPCError(message.id, {
            code: error.code,
            message: error.message,
            data: error.data,
          });
        }
      }

      return new RPCResponse(message.id, callResult);
    });

    if (result.ok) {
      return result.data;
    }

    if (result.data) {
      return new RPCError(message.id, result.data.error);
    }

    return new RPCError(message.id, { code: RPCErrorCodes.InternalError, message: result.error });
  }
}
