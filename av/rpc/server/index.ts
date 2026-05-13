import type Natav from "@av/natav";
import type { System } from "@av/system";
import {
  type RPCResponse,
  type RPCError,
  type SystemRpcRequest,
  type NatavRPCRequest,
  RPCErrorData,
} from "@av/rpc/types";
import { createRPCResponse, createRPCError, RPCErrorCode, isRPCRequest } from "@av/rpc/utils";
import { Telemetry } from "@av/telemetry";
import type { natav } from "@av/index";


export class RPCHandler<N extends Natav = natav> {
  private tel = new Telemetry("RPCHandler");
  private system: System<N>;
  private natav: N;

  constructor(args: { system: System<N>; natav: N }) {
    this.system = args.system;
    this.natav = args.natav;
  }

  async handleRequest(message: NatavRPCRequest): Promise<RPCResponse | RPCError> {
    const result = await this.tel.task("rpc:handle-request", async (span) => {
      this.tel.info("RPC_RECEIVED", {
        jsonrpc: message.jsonrpc,
        id: message.id,
        method: message.method,
      });

      if (!isRPCRequest(message)) {
        this.tel.warn("RPC_MALFORMED", { raw: message });
        return createRPCError(
          (message as any).id ?? null,
          RPCErrorCode.InvalidRequest,
          "Invalid RPC request format",
        );
      }

      span.setAttributes({
        "rpc.id": message.id,
        "rpc.method": message.method,
      });

      this.tel.info("RPC_VALIDATED", { message: message as any });

      switch (message.method) {
        case "system":
          this.tel.info("RPC_FORWARD_SYSTEM", { method: message.method });
          return this.handleSystemRequest(message);
        case "device.call":
          this.tel.info("RPC_FORWARD_DEVICE", { method: message.method });
          return this.handleDeviceRequest(message);
        case "device.dependents":
          this.tel.info("RPC_FORWARD_DEVICE_DEPS", {
            device: message.params.device,
          });
          return this.handleDeviceDepsRequest(message);
        default:
          // @ts-ignore-next-line
          tel.warn("RPC_METHOD_NOT_FOUND", { method: message.method });
          return createRPCError(
            // @ts-ignore-next-line
            message.id,
            RPCErrorCode.MethodNotFound,
            // @ts-ignore-next-line
            message.method,
          );
      }
    });

    if (result.ok) {
      return result.data;
    }

    this.tel.error("RPC_INTERNAL_ERROR", {
      error: result.error,
      id: (message as any)?.id,
    });

    return createRPCError((message as any)?.id ?? null, RPCErrorCode.InternalError, result.error);
  }

  private async handleDeviceDepsRequest(
    message: NatavRPCRequest & { method: "device.dependents" },
  ) {
    const dev = this.natav.FindDriver(message.params.device);
    if (!dev) {
      return createRPCError(message.id, RPCErrorCode.DeviceNotFound, "Unknown device");
    }

    return createRPCResponse(message.id, dev.deps);
  }

  private async handleSystemRequest(
    message: NatavRPCRequest & { method: "system" },
  ): Promise<RPCResponse | RPCError> {
    const systemRequest = message as SystemRpcRequest;
    const methodStr = message.params.call;

    const result = await this.tel.task(`system:${methodStr}`, async () => {
      this.tel.info("SYSTEM_EXEC_START", { method: methodStr, id: message.id });

      // Check if method exists
      if (
        !methodStr ||
        !(methodStr in this.system.api) ||
        typeof this.system.api[methodStr as keyof typeof this.system.api] !== "function"
      ) {
        this.tel.warn("SYSTEM_METHOD_MISSING", {
          method: message.method,
          parsed: methodStr,
        });
        return createRPCError(
          message.id,
          RPCErrorCode.MethodNotFound,
          `Unknown RPC method for system: "${message.method}"`,
        );
      }

      const methodReal = this.system.api[methodStr as keyof typeof this.system.api];
      const args = systemRequest.params?.args !== undefined ? [systemRequest.params.args] : [];

      // Execute the method
      const result = await Reflect.apply(methodReal, this.system.api, args);

      this.tel.info("SYSTEM_EXEC_SUCCESS", { method: methodStr, result });
      return createRPCResponse(message.id, result);
    });

    // 2. Result of the telemetry wrapper
    if (result.ok) {
      return result.data;
    }

    // Uncaught error in the task (wrapper-level)
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

  private async handleDeviceRequest(
    message: NatavRPCRequest & { method: "device.call" },
  ): Promise<RPCResponse | RPCError> {
    const { device: deviceName, method: methodName, args } = message.params;
    const argsArray = Array.isArray(args) ? args : [];

    // 1. Child Task for the specific device call
    const result = await this.tel.task(`device:${deviceName}.${methodName}`, async (span) => {
      // Metadata for quick filtering
      span.setAttributes({
        "device.name": deviceName,
        "device.method": methodName,
      });

      const device = this.natav.FindDriver(deviceName);
      if (!device) {
        this.tel.warn("DEVICE_NOT_FOUND", { device: deviceName });
        return createRPCError(
          message.id,
          RPCErrorCode.DeviceNotFound,
          `Device "${deviceName}" not found`,
          { availableDevices: this.natav.GetAllDriverNames() },
        );
      }

      // Check if method exists on device API
      if (
        device.api &&
        typeof device.api === "object" &&
        (!(methodName in device.api) ||
          typeof device.api[methodName as keyof typeof device.api] !== "function")
      ) {
        this.tel.warn("DEVICE_METHOD_MISSING", {
          device: deviceName,
          method: methodName,
        });
        return createRPCError(
          message.id,
          RPCErrorCode.DeviceMethodNotFound,
          `Method "${methodName}" not found on device "${deviceName}"`,
          { availableMethods: Object.keys(device.api) },
        );
      }

      this.tel.info("DEVICE_CALL_START", {
        device: deviceName,
        method: methodName,
        args: argsArray,
      });

      const method = (device.api as any)[methodName];
      let callResult: any;

      try {
        callResult = await method.apply(device.api, argsArray);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        this.tel.error("DEVICE_CALL_ERROR", {
          device: deviceName,
          method: methodName,
          error: errorMsg,
        });

        return createRPCError(
          message.id,
          RPCErrorCode.InternalError,
          `Device execution failed: ${deviceName}.${methodName}`,
          { error: errorMsg },
        );
      }

      this.tel.info("DEVICE_CALL_SUCCESS", {
        device: deviceName,
        method: methodName,
        result: callResult,
      });

      // Check if the result is a device error that should be returned as RPC error
      if (callResult && typeof callResult === "object" && "error" in callResult) {
        const { error } = callResult;
        if (error && typeof error === "object" && "code" in error && "message" in error) {
          return createRPCError(message.id, error.code, error.message, error.data);
        }
      }

      return createRPCResponse(message.id, callResult);
    });

    if (result.ok) {
      return result.data;
    }

    if (result.data instanceof RPCErrorData) {
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
