import type { Driver } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import {
  RPCError,
  RPCErrorCodes,
  RPCNotification,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import type { RPCRequestHandler } from "@av/rpc/server/router";
import type { WebSocketPeer } from "@av/rpc/server/websocket";
import { Telemetry } from "@av/telemetry";
import { Rpc, type Events, type Natav } from "@av/types";

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

export class DeviceRpcRouter<N extends Natav.Orch>
  extends TypedEventTarget<Events.System.Map<N>>
  implements RPCRequestHandler<N>
{
  prefix = "device.";
  private tel = new Telemetry("Rpc::Router::Device");
  private subscriptions = new Map<
    WebSocketPeer,
    Map<string, Array<() => void>>
  >();

  constructor(private natav: N) {
    super();
  }

  async handle(
    message: RPCRequest,
    peer: WebSocketPeer,
  ): Promise<RPCResponse | RPCError> {
    const params = message.DeviceParams();
    const err = new RPCError(message.id, {
      code: RPCErrorCodes.InvalidParams,
      message: "Invalid device call params",
    });

    if (!params) {
      return err;
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
        switch (message.method) {
          case Rpc.Methods.DeviceCall:
            return await this.call(device, message, params);
          case Rpc.Methods.DeviceSubscribe:
            return this.subscribe(device, message, params, peer);
          case Rpc.Methods.DeviceUnsubscribe:
            return this.unsubscribe(message, params, peer);
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
    peer: WebSocketPeer,
  ): RPCResponse | RPCError {
    const eventName = params.method;

    const events: unknown = device.events;

    if (!hasJsonEventTarget(events)) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "driver did not implement events",
      });
    }

    // TSAS: FindDriver guarantees the runtime name belongs to this natav instance.
    const deviceName = device.name as Natav.Names<N>;

    const cleanup = events.on(eventName, (data) => {
      if (peer.readyState !== 1) {
        return;
      }

      peer.send(
        JSON.stringify(
          new RPCNotification(Rpc.Methods.Notification, {
            type: "natav:device:event",
            name: deviceName,
            event: eventName,
            data,
          }),
        ),
      );
    });

    const peerSubscriptions =
      this.subscriptions.get(peer) ?? new Map<string, Array<() => void>>();
    const handlers = peerSubscriptions.get(eventName) ?? [];
    handlers.push(cleanup);
    peerSubscriptions.set(eventName, handlers);
    this.subscriptions.set(peer, peerSubscriptions);

    return new RPCResponse(message.id, null);
  }

  private unsubscribe(
    message: RPCRequest,
    params: Rpc.Device.CallParams,
    peer: WebSocketPeer,
  ): RPCResponse | RPCError {
    const eventName = params.method;

    const peerSubscriptions = this.subscriptions.get(peer);
    const handlers = peerSubscriptions?.get(eventName);
    const cleanup = handlers?.pop();
    if (cleanup) {
      cleanup();
      if (handlers && handlers.length === 0) {
        peerSubscriptions?.delete(eventName);
      }
      if (peerSubscriptions && peerSubscriptions.size === 0) {
        this.subscriptions.delete(peer);
      }
    }

    return new RPCResponse(message.id, null);
  }

  private async call(
    device: Driver,
    message: RPCRequest,
    params: Rpc.Device.CallParams,
  ) {
    const method = this.resolveApiMethod(device.api, params.method);

    if (!method) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.DeviceMethodNotFound,
        message: `Method \"${params.method}\" not found on device \"${params.device}\"`,
        data: { availableMethods: Object.keys(device.api ?? {}) },
      });
    }

    const callResult = await Reflect.apply(
      method.fn,
      method.target,
      params.args,
    );
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

    // TSAS: Device RPC responses are JSON payloads from the driver API.
    const jsonValue =
      callResult === undefined ? null : (callResult as Rpc.JSONValue);

    return new RPCResponse(message.id, jsonValue);
  }

  private resolveApiMethod(
    api: unknown,
    methodPath: string,
  ): { fn: (...args: unknown[]) => unknown; target: unknown } | null {
    const segments = methodPath.split("/").filter(Boolean);
    let target: any = api;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      if (target === null || target === undefined) {
        return null;
      }

      const next = target[segment];
      if (next === undefined) {
        return null;
      }

      if (i === segments.length - 1) {
        if (typeof next !== "function") {
          return null;
        }

        return { fn: next, target };
      }

      target = next;
    }

    return null;
  }

  closePeer(peer: WebSocketPeer) {
    const peerSubscriptions = this.subscriptions.get(peer);
    if (!peerSubscriptions) {
      return;
    }

    peerSubscriptions.forEach((cleanups) =>
      cleanups.forEach((cleanup) => cleanup()),
    );
    this.subscriptions.delete(peer);
  }
}
