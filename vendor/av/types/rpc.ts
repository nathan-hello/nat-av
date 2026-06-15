import type { LogEntry } from "@av/telemetry/types";
import type { Drivers } from "@av/types/drivers";
import type { Events } from "@av/types/events";

export namespace Rpc {
  export namespace WebSocket {
    export type App = {
      ws(
        path: string,
        handlers: {
          open(ws: Peer): void;
          message(ws: Peer, message: ArrayBuffer, isBinary: boolean): void;
          close(ws: Peer, code: number, message: ArrayBuffer): void;
          error(ws: Peer): void;
        },
      ): void;
    };

    export type Peer = {
      addr: string;
      readonly readyState: number;
      send(message: string): void;
      close(code?: number, reason?: string): void;
    };
  }
  export type PendingRequest = {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  };

  export type TransportOptions = {
    reconnect?: boolean;
    retryDelay?: number;
  };

  export namespace Client {
    export namespace Events {
      export type Callback<
        N extends Drivers.Array,
        Name extends Drivers.Names<N>,
        K extends keyof Drivers.Events<N, Name> & string,
      > = (payload: Drivers.Events<N, Name>[K]) => void;

      export type Handle<
        N extends Drivers.Array,
        Name extends Drivers.Names<N>,
      > = {
        on<K extends keyof Drivers.Events<N, Name> & string>(
          event: K,
          callback: Callback<N, Name, K>,
        ): Promise<() => Promise<void>>;
      };
      export type State = {
        callbacks: Set<(payload: any) => void>;
        subscribed: boolean;
        pendingSubscribe: Promise<void> | undefined;
        pendingUnsubscribe: Promise<void> | undefined;
      };
    }
  }

  export namespace Device {
    export const Methods = {
      DeviceCall: "device.call",
      DeviceSubscribe: "device.events.subscribe",
      DeviceUnsubscribe: "device.events.unsubscribe",
    } as const;

    export type CallParams = {
      device: string;
      method: string;
      args: any[];
    };
  }

  export namespace Debug {
    export type Node = {
      name: string;
      driverName: string;
      children: Node[];
      socket?: {
        traceName: string;
        canWrite: boolean;
        canReceive: boolean;
      };
    };

    export type SocketMessage = {
      traceName: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: number;
      data: Uint8Array;
      encoding: BufferEncoding | "unknown";
    };

    export type Notification =
      | {
          type: "debug:log";
          entry: LogEntry;
        }
      | {
          type: "debug:socket:message";
          message: SocketMessage;
        };
  }

  type JSONPrimitive = string | number | boolean | null;
  type JSONObject = { [key: string]: JSONValue };
  type JSONArray = JSONValue[];
  export type JSONValue = JSONPrimitive | JSONObject | JSONArray;

  type IsJSONValue<T> =
    T extends JSONValue ?
      [T] extends [never] ?
        false
      : true
    : false;

  type ValidateParams<Args extends any[]> =
    Args extends [] ? true
    : Args extends [infer Head, ...infer Tail] ?
      IsJSONValue<Head> extends true ?
        ValidateParams<Tail>
      : false
    : false;

  type IsJsonFunction<T> =
    T extends (...args: infer Args) => Promise<infer Return> ?
      ValidateParams<Args> extends true ?
        IsJSONValue<Return> extends true ?
          T
        : never
      : never
    : never;

  type FilterApi<T> = {
    [K in keyof T as IsJsonFunction<T[K]> extends never ? never : K]: T[K];
  };

  type FilterState<T> = {
    [K in keyof T as K extends string ? string : never]: {
      K: T[K] extends JSONValue ? T[K] : never;
    };
  };

  export type State<
    N extends Drivers.Array,
    Name extends Drivers.Names<N>,
  > = FilterState<Drivers.State<N, Name>>;

  export type Api<
    N extends Drivers.Array = Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = Drivers.Api<N, Name>;

  export const Methods = {
    Notification: "notification",
    GetAllDriverStates: "natav:all_states",
    ...Device.Methods,
  } as const;

  export namespace Protocol {
    export type Id = string | number;
    export type WireValue = JSONValue;

    export type ErrorShape = {
      code: number;
      message: string;
      data?: unknown;
    };

    type RequestMap = {
      [Methods.DeviceCall]: {
        params: Device.CallParams;
        result: WireValue;
      };
      [Methods.DeviceSubscribe]: {
        params: Device.CallParams;
        result: null;
      };
      [Methods.DeviceUnsubscribe]: {
        params: Device.CallParams;
        result: null;
      };
      [Methods.GetAllDriverStates]: {
        params: undefined;
        result: WireValue;
      };
    };

    type ServerNotificationMap = {
      "natav:device:event": Events.Natav.Map["natav:device:event"];
      "natav:state:update": Events.Natav.Map["natav:state:update"];
      "natav:device:connected": Events.Natav.Map["natav:device:connected"];
      "natav:device:disconnected": Events.Natav.Map["natav:device:disconnected"];
    };

    type DeviceParamsInput = {
      device: string;
      method: string;
      args?: any[];
    };

    type KnownMethod = keyof RequestMap & string;

    export type RequestParams<Method extends KnownMethod> =
      RequestMap[Method]["params"];
    export type RequestResult<Method extends KnownMethod> =
      RequestMap[Method]["result"];
    export type RequestFor<Method extends KnownMethod> = Request<
      Method,
      RequestParams<Method>,
      RequestResult<Method>
    >;
    export type RequestResultOf<TRequest extends Request> =
      TRequest extends Request<string, unknown, infer Result> ? Result : never;

    export type ServerNotificationType = keyof ServerNotificationMap & string;
    export type ServerNotificationParams<Type extends ServerNotificationType> =
      ServerNotificationMap[Type];
    export type ServerNotificationPayload<Type extends ServerNotificationType> =
      & { type: Type }
      & ServerNotificationParams<Type>
      & Record<string, WireValue>;
    export type KnownServerNotification = {
      [Type in ServerNotificationType]: ServerNotification<Type>;
    }[ServerNotificationType];

    export const ErrorCodes = {
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
      DeviceNotFound: -32001,
      DeviceMethodNotFound: -32002,
      DeviceCallFailed: -32003,
    } as const;

    export namespace JSON {
      export type Hooks = {
        replace?: (value: unknown) => unknown;
        revive?: (value: unknown) => unknown;
      };

      let hooks: Hooks = {};

      export function configure(next: Hooks) {
        hooks = next;
      }

      export function stringify(value: unknown): string {
        return globalThis.JSON.stringify(encode(value));
      }

      export function parse(value: string): unknown {
        return decode(globalThis.JSON.parse(value));
      }

      function encode(value: unknown): unknown {
        const replaced = hooks.replace?.(value) ?? value;

        if (Array.isArray(replaced)) {
          return replaced.map(encode);
        }

        if (replaced && typeof replaced === "object") {
          return Object.fromEntries(
            Object.entries(replaced).map(([key, child]) => [key, encode(child)]),
          );
        }

        return replaced;
      }

      function decode(value: unknown): unknown {
        const decoded =
          Array.isArray(value) ? value.map(decode)
          : value && typeof value === "object" ?
            Object.fromEntries(
              Object.entries(value).map(([key, child]) => [key, decode(child)]),
            )
          : value;

        return hooks.revive?.(decoded) ?? decoded;
      }
    }

    function parseMessageObject(value: unknown): Record<string, unknown> | null {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          return null;
        }
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }

      // TSAS: After excluding null and arrays, keyed JSON-RPC field access needs a record shape.
      return value as Record<string, unknown>;
    }

    function isId(value: unknown): value is Id {
      return typeof value === "string" || typeof value === "number";
    }

    function isObject(value: unknown): value is Record<string, unknown> {
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function normalizeDeviceParams(params: DeviceParamsInput): Device.CallParams {
      return {
        device: params.device,
        method: params.method,
        args: Array.isArray(params.args) ? params.args : [],
      };
    }

    function parseDeviceParams(value: unknown): Device.CallParams | null {
      if (!isObject(value)) {
        return null;
      }

      // TSAS: The runtime checks above ensure this params object can be inspected by key.
      const params = value as {
        device?: unknown;
        method?: unknown;
        args?: unknown;
      };

      if (typeof params.device !== "string" || typeof params.method !== "string") {
        return null;
      }

      return {
        device: params.device,
        method: params.method,
        args: Array.isArray(params.args) ? params.args : [],
      };
    }

    function toServerNotificationPayload<Type extends ServerNotificationType>(
      type: Type,
      params: ServerNotificationParams<Type>,
    ): ServerNotificationPayload<Type> {
      // TSAS: Event payload types are already JSON-safe, but proving the spread satisfies the generic record is noisy.
      return { type, ...params } as ServerNotificationPayload<Type>;
    }

    function parseServerNotification(
      value: unknown,
    ): KnownServerNotification | null {
      const notification = Notification.is(value);
      if (!notification || notification.method !== Methods.Notification) {
        return null;
      }

      const params = notification.params;
      if (!isObject(params) || typeof params.type !== "string") {
        return null;
      }

      switch (params.type) {
        case "natav:device:event":
          if (
            typeof params.name !== "string" ||
            typeof params.event !== "string" ||
            !isJSONValue(params.data)
          ) {
            return null;
          }

          return new ServerNotification("natav:device:event", {
            name: params.name,
            event: params.event,
            data: params.data,
          });
        case "natav:state:update":
          if (typeof params.name !== "string" || !isJSONValue(params.data)) {
            return null;
          }

          return new ServerNotification("natav:state:update", {
            name: params.name,
            // TSAS: The JSON-value runtime guard above is the strongest practical check for driver state payloads.
            data: params.data as ServerNotificationParams<"natav:state:update">["data"],
          });
        case "natav:device:connected":
          if (typeof params.name !== "string") {
            return null;
          }

          return new ServerNotification("natav:device:connected", {
            name: params.name,
          });
        case "natav:device:disconnected":
          if (typeof params.name !== "string") {
            return null;
          }

          return new ServerNotification("natav:device:disconnected", {
            name: params.name,
          });
        default:
          return null;
      }
    }

    export class Request<
      Method extends string = string,
      Params = unknown,
      Result extends WireValue = WireValue,
    > {
      readonly jsonrpc: "2.0" = "2.0";

      constructor(
        public id: Id,
        public method: Method,
        public params?: Params,
      ) {}

      response(result: Result): Response<Result> {
        return new Response(this.id, result);
      }

      error(error: ErrorShape): Error {
        return new Error(this.id, error);
      }

      DeviceParams(): Device.CallParams | null {
        if (
          this.method !== Methods.DeviceCall &&
          this.method !== Methods.DeviceSubscribe &&
          this.method !== Methods.DeviceUnsubscribe
        ) {
          return null;
        }

        return parseDeviceParams(this.params);
      }

      static is(value: unknown): Request | null {
        const message = parseMessageObject(value);
        if (
          !message ||
          message.jsonrpc !== "2.0" ||
          !isId(message.id) ||
          typeof message.method !== "string"
        ) {
          return null;
        }

        return new Request(
          message.id,
          message.method,
          "params" in message ? message.params : undefined,
        );
      }

      static deviceCall(
        id: Id,
        params: DeviceParamsInput,
      ): RequestFor<typeof Methods.DeviceCall> {
        return new Request(id, Methods.DeviceCall, normalizeDeviceParams(params));
      }

      static deviceSubscribe(
        id: Id,
        params: DeviceParamsInput,
      ): RequestFor<typeof Methods.DeviceSubscribe> {
        return new Request(
          id,
          Methods.DeviceSubscribe,
          normalizeDeviceParams(params),
        );
      }

      static deviceUnsubscribe(
        id: Id,
        params: DeviceParamsInput,
      ): RequestFor<typeof Methods.DeviceUnsubscribe> {
        return new Request(
          id,
          Methods.DeviceUnsubscribe,
          normalizeDeviceParams(params),
        );
      }
    }

    export class Response<T extends WireValue = WireValue> {
      readonly jsonrpc: "2.0" = "2.0";

      constructor(
        public id: Id,
        public result: T,
      ) {}

      static from<TRequest extends Request>(
        request: TRequest,
        result: RequestResultOf<TRequest>,
      ): Response<RequestResultOf<TRequest>> {
        return new Response(request.id, result);
      }

      static is(value: unknown): Response | null {
        const message = parseMessageObject(value);
        if (
          !message ||
          message.jsonrpc !== "2.0" ||
          !isId(message.id) ||
          !Object.hasOwn(message, "result") ||
          !isJSONValue(message.result)
        ) {
          return null;
        }

        return new Response(message.id, message.result);
      }
    }

    export class Error {
      readonly jsonrpc: "2.0" = "2.0";

      constructor(
        public id: Id | null,
        public error: ErrorShape,
      ) {}

      static is(value: unknown): Error | null {
        const message = parseMessageObject(value);
        if (
          !message ||
          message.jsonrpc !== "2.0" ||
          !(message.id === null || isId(message.id)) ||
          !isObject(message.error)
        ) {
          return null;
        }

        // TSAS: The runtime checks above guarantee keyed access to the JSON-RPC error object.
        const error = message.error as {
          code?: unknown;
          message?: unknown;
          data?: unknown;
        };

        if (typeof error.code !== "number" || typeof error.message !== "string") {
          return null;
        }

        return new Error(message.id, {
          code: error.code,
          message: error.message,
          data: error.data,
        });
      }
    }

    export class ErrorData extends globalThis.Error {
      constructor(public error: ErrorShape) {
        super(error.message);
        this.name = "RPCErrorData";
      }
    }

    export class Notification<
      Method extends string = string,
      Params extends Record<string, WireValue> = Record<string, WireValue>,
    > {
      readonly jsonrpc: "2.0" = "2.0";

      constructor(
        public method: Method,
        public params: Params,
      ) {}

      static is(value: unknown): Notification | null {
        const message = parseMessageObject(value);
        if (
          !message ||
          message.jsonrpc !== "2.0" ||
          typeof message.method !== "string" ||
          !isObject(message.params) ||
          !isJSONValue(message.params)
        ) {
          return null;
        }

        return new Notification(message.method, message.params);
      }
    }

    export class ServerNotification<
      Type extends ServerNotificationType = ServerNotificationType,
    > extends Notification<
      typeof Methods.Notification,
      ServerNotificationPayload<Type>
    > {
      constructor(type: Type, params: ServerNotificationParams<Type>) {
        super(Methods.Notification, toServerNotificationPayload(type, params));
      }

      get type(): Type {
        return this.params.type;
      }

      static is(value: unknown): KnownServerNotification | null {
        return parseServerNotification(value);
      }
    }

    export const Errors = {
      JsonParse: (id?: Id, data?: unknown) =>
        new Error(id ?? null, {
          message: "JSON Parse Error",
          code: ErrorCodes.ParseError,
          data,
        }),
      RequestInvalid: (id?: Id, data?: unknown) =>
        new Error(id ?? null, {
          message: "Not a JSONRPC Request",
          code: ErrorCodes.InvalidRequest,
          data,
        }),
    };

    export function isJSONValue(value: unknown): value is JSONValue {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return true;
      }

      if (Array.isArray(value)) {
        return value.every(isJSONValue);
      }

      if (value && typeof value === "object") {
        return Object.values(value).every(isJSONValue);
      }

      return false;
    }
  }
}
