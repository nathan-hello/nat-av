import type { Driver } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { Rpc, type Events } from "@av/types";

type DriverRpcManager = {
  FindDriver(name: string): Driver | undefined;
  GetAllDriverNames(): string[];
};

function hasJsonEventTarget(
  value: unknown,
): value is TypedEventTarget<Record<string, Rpc.Json.Value>> {
  return (
    typeof value === "object" &&
    value !== null &&
    "on" in value &&
    // TSAS: We only need the runtime `on` slot to validate the event target shape.
    typeof (value as { on?: unknown }).on === "function"
  );
}

export class DriverRpcRouter extends TypedEventTarget<Events.Natav.Map> {
  private tel = new Telemetry("Rpc::Router::Driver");
  private subscriptions = new Map<
    Rpc.WebSocket.Peer,
    Map<string, Array<() => void>>
  >();

  constructor(private natav: DriverRpcManager) {
    super();
  }

  async handle(
    message: Rpc.Request,
    peer: Rpc.WebSocket.Peer,
  ): Promise<Rpc.Response | Rpc.Error> {
    const params = message.DriverParams();
    const err = new Rpc.Error(
      {
        code: Rpc.Error.Codes.InvalidParams,
        message: "Invalid driver call params",
      },
      message.id,
    );

    if (!params) {
      return err;
    }

    const result = await this.tel.task(
      `driver:${params.driver}.${params.method}`,
      async (span) => {
        span.setAttributes({
          "driver.name": params.driver,
          "driver.method": params.method,
        });

        const driver = this.natav.FindDriver(params.driver);
        if (!driver) {
          return new Rpc.Error(
            {
              code: Rpc.Error.Codes.DriverNotFound,
              message: `Driver \"${params.driver}\" not found`,
              data: { availableDriver: this.natav.GetAllDriverNames() },
            },
            message.id,
          );
        }
        switch (message.method) {
          case Rpc.Request.Methods.DriverCall:
            return await this.call(driver, message, params);
          case Rpc.Request.Methods.DriverSubscribe:
            return this.subscribe(driver, message, params, peer);
          case Rpc.Request.Methods.DriverUnsubscribe:
            return this.unsubscribe(message, params, peer);
          default:
            return new Rpc.Error(
              {
                code: Rpc.Error.Codes.InvalidParams,
                message: "Invalid driver call params",
              },
              message.id,
            );
        }
      },
    );

    if (result.ok) {
      return result.data;
    }

    if (result.data) {
      return new Rpc.Error(result.data.error, message.id);
    }

    return new Rpc.Error(
      {
        code: Rpc.Error.Codes.InternalError,
        message: result.error,
      },
      message.id,
    );
  }

  private subscribe(
    driver: Driver,
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Response | Rpc.Error {
    const eventName = params.method;

    const events: unknown = driver.events;

    if (!hasJsonEventTarget(events)) {
      return new Rpc.Error(
        {
          code: Rpc.Error.Codes.InvalidParams,
          message: "driver did not implement events",
        },
        message.id,
      );
    }

    const cleanup = events.on(eventName, (data) => {
      if (peer.readyState !== 1) {
        return;
      }

      const event: Events.Natav.Map["natav:driver:event"] = {
        name: driver.name,
        event: eventName,
        data,
      };

      peer.send(
        Rpc.Json.stringify(
          new Rpc.Notification.Server("natav:driver:event", event),
        ),
      );
    });

    const peerSubscriptions =
      this.subscriptions.get(peer) ?? new Map<string, Array<() => void>>();
    const handlers = peerSubscriptions.get(eventName) ?? [];
    handlers.push(cleanup);
    peerSubscriptions.set(eventName, handlers);
    this.subscriptions.set(peer, peerSubscriptions);

    return message.response(null);
  }

  private unsubscribe(
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Response | Rpc.Error {
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

    return message.response(null);
  }

  private async call(
    driver: Driver,
    message: Rpc.Request,
    params: Rpc.Request.DriverParams,
  ) {
    const method = this.resolveApiMethod(driver.api, params.method);

    if (!method) {
      return new Rpc.Error(
        {
          code: Rpc.Error.Codes.DriverMethodNotFound,
          message: `Method \"${params.method}\" not found on driver \"${params.driver}\"`,
          data: { availableMethods: Object.keys(driver.api ?? {}) },
        },
        message.id,
      );
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
        return new Rpc.Error(
          {
            code: error.code,
            message: error.message,
            data: error.data,
          },
          message.id,
        );
      }
    }

    // TSAS: Driver RPC responses are JSON payloads from the driver API.
    const jsonValue =
      callResult === undefined ? null : (callResult as Rpc.Json.Value);

    return message.response(jsonValue);
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

  closePeer(peer: Rpc.WebSocket.Peer) {
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
