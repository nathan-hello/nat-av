import type { Drivers } from "@av/types/drivers";
import type { Events } from "@av/types/events";

export namespace Rpc {
  export type JSONValue =
    | null
    | boolean
    | number
    | string
    | JSONValue[]
    | { [key: string]: JSONValue };

  export namespace Client {
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
    export type PendingRequest = {
      resolve: (result: any) => void;
      reject: (error: Rpc.Protocol.Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    };
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
    export type State<
      N extends Drivers.Array,
      Name extends Drivers.Names<N>,
    > = FilterState<Drivers.State<N, Name>>;

    export type Api<
      N extends Drivers.Array = Drivers.Array,
      Name extends Drivers.Names<N> = Drivers.Names<N>,
    > = FilterApi<Drivers.Api<N, Name>>;
  }

    type Id = string | number;

    type ErrorShape = {
      code: number;
      message: string;
      data?: unknown;
    };

    const REQUEST_METHOD = {
      DeviceCall: "device.call",
      DeviceSubscribe: "device.events.subscribe",
      DeviceUnsubscribe: "device.events.unsubscribe",
      GetAllDriverStates: "natav:all_states",
    } as const;

    const NOTIFICATION_METHOD = "notification" as const;

    type DeviceParamsInput = {
      device: string;
      method: string;
      args?: any[];
    };

    type Tagged<Type extends string, Params extends Record<string, unknown>> = {
      type: Type;
    } & Params;

    type RemoveTag<T extends { type: string }> = Omit<T, "type">;

    type RequestSpecFor<Method extends KnownRequestMethod> = Extract<
      KnownRequestSpec,
      { method: Method }
    >;

    type RequestParamsFor<Method extends KnownRequestMethod> =
      RequestSpecFor<Method>["params"];

    type RequestResultFor<Method extends KnownRequestMethod> =
      RequestSpecFor<Method>["result"];

    type RequestMessageFor<Method extends KnownRequestMethod> = Request<
      Method,
      RequestParamsFor<Method>,
      RequestResultFor<Method>
    >;

    type ServerNotificationPayloadMap = {
      [K in keyof Events.Natav.Map & string]: Tagged<K, Events.Natav.Map[K]>;
    };

    type KnownServerNotificationType = keyof ServerNotificationPayloadMap &
      string;

    type ServerNotificationPayloadFor<
      Type extends KnownServerNotificationType,
    > = ServerNotificationPayloadMap[Type] & Record<string, JSONValue>;

    type ServerNotificationParamsFor<Type extends KnownServerNotificationType> =
      RemoveTag<ServerNotificationPayloadFor<Type>>;

    type KnownServerNotificationMessage = {
      [Type in KnownServerNotificationType]: ServerNotification<Type>;
    }[KnownServerNotificationType];

    export const ErrorCodes = {
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
      DeviceNotFound: -32001,
      DeviceMethodNotFound: -32002,
      DeviceCallFailed: -32003,
      RpcTimeout: -32004,
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
            Object.entries(replaced).map(([key, child]) => [
              key,
              encode(child),
            ]),
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

    function parseMessageObject(
      value: unknown,
    ): Record<string, unknown> | null {
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
      return (
        Boolean(value) && typeof value === "object" && !Array.isArray(value)
      );
    }

    function normalizeDeviceParams(
      params: DeviceParamsInput,
    ): Rpc.Request.DeviceParams {
      return {
        device: params.device,
        method: params.method,
        args: Array.isArray(params.args) ? params.args : [],
      };
    }

    function parseDeviceParams(value: unknown): Rpc.Request.DeviceParams | null {
      if (!isObject(value)) {
        return null;
      }

      // TSAS: The runtime checks above ensure this params object can be inspected by key.
      const params = value as {
        device?: unknown;
        method?: unknown;
        args?: unknown;
      };

      if (
        typeof params.device !== "string" ||
        typeof params.method !== "string"
      ) {
        return null;
      }

      return {
        device: params.device,
        method: params.method,
        args: Array.isArray(params.args) ? params.args : [],
      };
    }

    function toServerNotificationPayload<
      Type extends KnownServerNotificationType,
    >(
      type: Type,
      params: ServerNotificationParamsFor<Type>,
    ): ServerNotificationPayloadFor<Type> {
      // TSAS: Event payload types are already JSON-safe, but proving the spread satisfies the generic record is noisy.
      return { type, ...params } as ServerNotificationPayloadFor<Type>;
    }

    function parseDeviceEventNotification(
      params: Record<string, unknown>,
    ): ServerNotification<"natav:device:event"> | null {
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
    }

    function parseStateUpdateNotification(
      params: Record<string, unknown>,
    ): ServerNotification<"natav:state:update"> | null {
      if (typeof params.name !== "string" || !isJSONValue(params.data)) {
        return null;
      }

      return new ServerNotification("natav:state:update", {
        name: params.name,
        // TSAS: The JSON-value runtime guard above is the strongest practical check for driver state payloads.
        data: params.data as ServerNotificationParamsFor<"natav:state:update">["data"],
      });
    }

    function parseConnectedNotification(
      params: Record<string, unknown>,
    ): ServerNotification<"natav:device:connected"> | null {
      if (typeof params.name !== "string") {
        return null;
      }

      return new ServerNotification("natav:device:connected", {
        name: params.name,
      });
    }

    function parseDisconnectedNotification(
      params: Record<string, unknown>,
    ): ServerNotification<"natav:device:disconnected"> | null {
      if (typeof params.name !== "string") {
        return null;
      }

      return new ServerNotification("natav:device:disconnected", {
        name: params.name,
      });
    }

    function parseServerNotification(
      value: unknown,
    ): KnownServerNotificationMessage | null {
      const notification = Notification.is(value);
      if (!notification || notification.method !== NOTIFICATION_METHOD) {
        return null;
      }

      const params = notification.params;
      if (!isObject(params) || typeof params.type !== "string") {
        return null;
      }

      switch (params.type) {
        case "natav:device:event":
          return parseDeviceEventNotification(params);
        case "natav:state:update":
          return parseStateUpdateNotification(params);
        case "natav:device:connected":
          return parseConnectedNotification(params);
        case "natav:device:disconnected":
          return parseDisconnectedNotification(params);
        default:
          return null;
      }
    }

    export class Request<
      Method extends string = string,
      Params = unknown,
      Result extends JSONValue = JSONValue,
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

      DeviceParams(): Request.DeviceParams | null {
        if (
          this.method !== REQUEST_METHOD.DeviceCall &&
          this.method !== REQUEST_METHOD.DeviceSubscribe &&
          this.method !== REQUEST_METHOD.DeviceUnsubscribe
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
      ): RequestMessageFor<typeof REQUEST_METHOD.DeviceCall> {
        return new Request(
          id,
          REQUEST_METHOD.DeviceCall,
          normalizeDeviceParams(params),
        );
      }

      static deviceSubscribe(
        id: Id,
        params: DeviceParamsInput,
      ): RequestMessageFor<typeof REQUEST_METHOD.DeviceSubscribe> {
        return new Request(
          id,
          REQUEST_METHOD.DeviceSubscribe,
          normalizeDeviceParams(params),
        );
      }

      static deviceUnsubscribe(
        id: Id,
        params: DeviceParamsInput,
      ): RequestMessageFor<typeof REQUEST_METHOD.DeviceUnsubscribe> {
        return new Request(
          id,
          REQUEST_METHOD.DeviceUnsubscribe,
          normalizeDeviceParams(params),
        );
      }
    }

    export namespace Request {
      export const Method = REQUEST_METHOD;
      export type DeviceParams = { device: string; method: string; args: any[]; };
      export type DeviceCall = {
      method: typeof REQUEST_METHOD.DeviceCall;
      params: Rpc.Request.DeviceParams;
      result: JSONValue;
    };
      export type DeviceSubscribe = {
      method: typeof REQUEST_METHOD.DeviceSubscribe;
      params: Rpc.Request.DeviceParams;
      result: null;
    };
      export type DeviceUnsubscribe = {
      method: typeof REQUEST_METHOD.DeviceUnsubscribe;
      params: Rpc.Request.DeviceParams;
      result: null;
    };
      export type GetAllDriverStates = {
      method: typeof REQUEST_METHOD.GetAllDriverStates;
      params: undefined;
      result: JSONValue;
    };
      type Any = KnownRequestSpec;
      export type Method = KnownRequestMethod;
      export type Spec<MethodName extends Method> = RequestSpecFor<MethodName>;
      export type Params<MethodName extends Method> =
        RequestParamsFor<MethodName>;
      export type Result<MethodName extends Method> =
        RequestResultFor<MethodName>;
      export type Message<MethodName extends Method> =
        RequestMessageFor<MethodName>;
      export type ResultOf<TRequest extends Protocol.Request> =
        TRequest extends Protocol.Request<string, unknown, infer ResultType> ?
          ResultType
        : never;
    }

    export class Response<T extends JSONValue = JSONValue> {
      readonly jsonrpc: "2.0" = "2.0";

      constructor(
        public id: Id,
        public result: T,
      ) {}

      static from<TRequest extends Request>(
        request: TRequest,
        result: Request.ResultOf<TRequest>,
      ): Response<Request.ResultOf<TRequest>> {
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

        if (
          typeof error.code !== "number" ||
          typeof error.message !== "string"
        ) {
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
      Params extends Record<string, JSONValue> = Record<string, JSONValue>,
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
      Type extends KnownServerNotificationType = KnownServerNotificationType,
    > extends Notification<
      typeof NOTIFICATION_METHOD,
      ServerNotificationPayloadFor<Type>
    > {
      constructor(type: Type, params: ServerNotificationParamsFor<Type>) {
        super(NOTIFICATION_METHOD, toServerNotificationPayload(type, params));
      }

      get type(): Type {
        return this.params.type;
      }

      static is(value: unknown): ServerNotification.Any | null {
        return parseServerNotification(value);
      }
    }

    export namespace ServerNotification {
      export const Method = NOTIFICATION_METHOD;
      export type Any = KnownServerNotificationMessage;
      export type Type = KnownServerNotificationType;
      export type Payload<TypeName extends Type> =
        ServerNotificationPayloadFor<TypeName>;
      export type Params<TypeName extends Type> =
        ServerNotificationParamsFor<TypeName>;
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

  export type TransportOptions = {
    reconnect?: boolean;
    retryDelay?: number;
  };
}
