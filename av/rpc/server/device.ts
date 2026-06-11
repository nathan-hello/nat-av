import type { natav } from "@av/index";
import type { Natav, Rpc, Events } from "@av/types";
import { RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import { Telemetry } from "@av/telemetry";
import { RPCErrorCodes } from "@av/rpc/protocol";
import type { Driver } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";

function hasJsonEventTarget(
  value: unknown,
): value is TypedEventTarget<Record<string, Rpc.JSONValue>> {
  return (
    typeof value === "object" &&
    value !== null &&
    "on" in value &&
    // TSAS: We only need the runtime `on` slot to validate the event target shape.
    typeof (value as { on?: unknown }).on === "function"
  );
}

export class DeviceRpcRouter<N extends Natav.Orch = natav>
  extends TypedEventTarget<Events.System.Map<N>>
  implements RPCRequestHandler<N>
{
  prefix = "device.";
  private tel = new Telemetry("Rpc::Router::Device");

  constructor(private natav: N) {
    super();
  }

  async handle(message: RPCRequest): Promise<RPCResponse | RPCError> {
    const params = message.deviceCallParams();
    if (!params) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid device call params",
      });
    }

    const result = await this.tel.task(
      `device:${params.device}.${params.method}`,
      async (span) => {
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
        switch (params.method) {
          case "device.call":
            return await this.call(device, message, params);
          case "device.events.subscribe":
            return this.subscribe(device, message, params);
          default:
            return new RPCError(message.id, {
              code: RPCErrorCodes.InvalidParams,
              message: "Invalid device call params",
            });
        }
      },
    );

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

  private subscribe(
    device: Driver,
    message: RPCRequest,
    params: Rpc.Device.CallParams,
  ): RPCResponse | RPCError {
    const eventName = params.args[0];

    if (typeof eventName !== "string") {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid device call params",
      });
    }

    const events: unknown = device.events;

    if (!hasJsonEventTarget(events)) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "driver did not implement events",
      });
    }

    // TSAS: FindDriver guarantees the runtime name belongs to this natav instance.
    const deviceName = device.name as Natav.Names<N>;

    events.on(eventName, (data) => {
      this.dispatch("natav:device:event", {
        name: deviceName,
        event: eventName,
        data,
      });
    });

    return new RPCResponse(message.id, null);
  }

  private async call(
    device: Driver,
    message: RPCRequest,
    params: Rpc.Device.CallParams,
  ) {
    // FIXME: this does not recurse through the api shape
    const method = device.api?.[params.method];

    if (typeof method !== "function") {
      return new RPCError(message.id, {
        code: RPCErrorCodes.DeviceMethodNotFound,
        message: `Method \"${params.method}\" not found on device \"${params.device}\"`,
        data: { availableMethods: Object.keys(device.api ?? {}) },
      });
    }

    const callResult = await Reflect.apply(method, device.api, params.args);
    if (callResult && typeof callResult === "object" && "error" in callResult) {
      // TSAS:
      const error = (
        callResult as {
          error?: { code?: number; message?: string; data?: any };
        }
      ).error;
      if (
        error &&
        typeof error.code === "number" &&
        typeof error.message === "string"
      ) {
        return new RPCError(message.id, {
          code: error.code,
          message: error.message,
          data: error.data,
        });
      }
    }

    return new RPCResponse(
      message.id,
      callResult === undefined ? null : callResult,
    );
  }
}
