import type { natav } from "@av/index";
import type Natav from "@av/natav";
import { parseDeviceCallParams } from "@av/rpc/protocol";
import { type NatavRPCRequest, type RPCError, type RPCResponse } from "@av/rpc/types";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import { Telemetry } from "@av/telemetry";
import { createRPCError, createRPCResponse, RPCErrorCode } from "@av/rpc/utils";

export class DeviceRpcRouter<N extends Natav = natav> implements RPCRequestHandler {
  prefix = "device.";
  private tel = new Telemetry("DeviceRpcRouter");

  constructor(private natav: N) {}

  async handle(message: NatavRPCRequest): Promise<RPCResponse | RPCError> {
    const params = parseDeviceCallParams(message);
    if (!params) {
      return createRPCError(message.id, RPCErrorCode.InvalidParams, "Invalid device call params");
    }

    const result = await this.tel.task(`device:${params.device}.${params.method}`, async (span) => {
      span.setAttributes({
        "device.name": params.device,
        "device.method": params.method,
      });

      const device = this.natav.FindDriver(params.device);
      if (!device) {
        return createRPCError(
          message.id,
          RPCErrorCode.DeviceNotFound,
          `Device \"${params.device}\" not found`,
          { availableDevices: this.natav.GetAllDriverNames() },
        );
      }

      const method = (device.api as Record<string, unknown> | undefined)?.[params.method];
      if (typeof method !== "function") {
        return createRPCError(
          message.id,
          RPCErrorCode.DeviceMethodNotFound,
          `Method \"${params.method}\" not found on device \"${params.device}\"`,
          { availableMethods: Object.keys(device.api ?? {}) },
        );
      }

      const callResult = await Reflect.apply(method, device.api, params.args);
      if (callResult && typeof callResult === "object" && "error" in callResult) {
        const error = (callResult as { error?: { code?: number; message?: string; data?: any } }).error;
        if (error && typeof error.code === "number" && typeof error.message === "string") {
          return createRPCError(message.id, error.code, error.message, error.data);
        }
      }

      return createRPCResponse(message.id, callResult);
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
