import type { Drivers } from "@av/types/drivers";
import type { Events } from "@av/types/events";

export namespace Rpc {
  export namespace Json {
    export function is(value: unknown): value is Rpc.Json.Value {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return true;
      }

      if (Array.isArray(value)) {
        return value.every(is);
      }

      if (value && typeof value === "object") {
        return Object.values(value).every(is);
      }

      return false;
    }
    export function stringify(value: Super): string {
      return globalThis.JSON.stringify(value);
    }

    export function parse(value: string): Super {
      return globalThis.JSON.parse(value);
    }

    export type Value =
      | null
      | boolean
      | number
      | string
      | Value[]
      | { [key: string]: Value };

    export type Super = Value | undefined | Error | Uint8Array;

    export type IsJSON<T> =
      T extends Value ?
        [T] extends [never] ?
          false
        : true
      : false;
  }

  export namespace Client {
    type ValidateParams<Args extends any[]> =
      Args extends [] ? true
      : Args extends [infer Head, ...infer Tail] ?
        Rpc.Json.IsJSON<Head> extends true ?
          ValidateParams<Tail>
        : false
      : false;

    type IsJsonFunction<T> =
      T extends (...args: infer Args) => Promise<infer Return> ?
        ValidateParams<Args> extends true ?
          Rpc.Json.IsJSON<Return> extends true ?
            T
          : never
        : never
      : never;

    type FilterApi<T> = {
      [K in keyof T as IsJsonFunction<T[K]> extends never ? never : K]: T[K];
    };

    type FilterState<T> = {
      [K in keyof T as K extends string ? string : never]: {
        K: T[K] extends Rpc.Json.Value ? T[K] : never;
      };
    };
    export type PendingRequest = {
      resolve: (result: any) => void;
      reject: (error: Rpc.Error) => void;
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

  const REQUEST_METHOD = {
    DeviceCall: "natav:driver:api",
    DeviceSubscribe: "natav:driver:events:subscribe",
    DeviceUnsubscribe: "natav:driver:events:unsubscribe",
    GetAllDriverStates: "natav:all_states",
  } as const;

  type DeviceParamsInput = {
    device: string;
    method: string;
    args?: any[];
  };

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

  export class Request<
    Method extends string = string,
    Params = unknown,
    Result extends Rpc.Json.Value = Rpc.Json.Value,
  > {
    readonly jsonrpc: "2.0" = "2.0";

    constructor(
      public id: Id,
      public method: Method,
      public params?: Params,
    ) {}

    response(result: Result): Response<Result> {
      return new Rpc.Response(this.id, result);
    }

    error(error: Rpc.Error.Shape): Error {
      return new Rpc.Error(error, this.id);
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

    static is(message: Rpc.Json.Value): Request | null {
      if (
        message === null ||
        typeof message !== "object" ||
        !message ||
        !("jsonrpc" in message) ||
        message.jsonrpc !== "2.0" ||
        (typeof message.id !== "string" && typeof message.id !== "number") ||
        typeof message.method !== "string"
      ) {
        return null;
      }

      return new Rpc.Request(
        message.id,
        message.method,
        "params" in message ? message.params : undefined,
      );
    }

    static deviceCall(id: Id, params: DeviceParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DeviceCall,
        normalizeDeviceParams(params),
      );
    }

    static deviceSubscribe(id: Id, params: DeviceParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DeviceSubscribe,
        normalizeDeviceParams(params),
      );
    }

    static deviceUnsubscribe(id: Id, params: DeviceParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DeviceUnsubscribe,
        normalizeDeviceParams(params),
      );
    }
  }

  export namespace Request {
    export const Method = REQUEST_METHOD;
    export type DeviceParams = { device: string; method: string; args: any[] };
    export type DeviceCall = {
      method: typeof REQUEST_METHOD.DeviceCall;
      params: Rpc.Request.DeviceParams;
      result: Rpc.Json.Value;
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
      result: Rpc.Json.Value;
    };
    export type ResultOf<TRequest extends Rpc.Request> =
      TRequest extends Rpc.Request<string, unknown, infer ResultType> ?
        ResultType
      : never;
  }

  export class Response<T extends Rpc.Json.Value = Rpc.Json.Value> {
    readonly jsonrpc: "2.0" = "2.0";

    constructor(
      public id: Id,
      public result: T,
    ) {}

    static from<TRequest extends Request>(
      request: TRequest,
      result: Request.ResultOf<TRequest>,
    ): Response<Request.ResultOf<TRequest>> {
      return new Rpc.Response(request.id, result);
    }

    static is(message: Rpc.Json.Value): Response | null {
      if (
        message === null ||
        typeof message !== "object" ||
        !message ||
        !("jsonrpc" in message) ||
        message.jsonrpc !== "2.0" ||
        (typeof message.id !== "string" && typeof message.id !== "number") ||
        typeof message.method !== "string" ||
        !Rpc.Json.is(message.result)
      ) {
        return null;
      }

      return new Rpc.Response(message.id, message.result);
    }
  }

  export class Error {
    readonly jsonrpc: "2.0" = "2.0";

    constructor(
      public error: Rpc.Error.Shape,
      public id?: Id | null,
    ) {}

    static is(message: Rpc.Json.Value): Rpc.Error | null {
      if (
        message === null ||
        typeof message !== "object" ||
        !("jsonrpc" in message) ||
        !message ||
        message.jsonrpc !== "2.0" ||
        !(message.id === null) ||
        !(typeof message.id === "string" && typeof message.id === "number") ||
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

  export namespace Error {
    export type Shape = {
      code: number;
      message: string;
      data?: unknown;
    };

    export const Codes = {
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
  }

  export class Notification<
    Method extends string = string,
    Params extends object = Record<string, unknown>,
  > {
    readonly jsonrpc: "2.0" = "2.0";

    constructor(
      public method: Method,
      public params: Params,
    ) {}

    static is(message: Rpc.Json.Value): Notification | null {
      if (
        message === null ||
        typeof message !== "object" ||
        !message ||
        !("jsonrpc" in message) ||
        message.jsonrpc !== "2.0" ||
        typeof message.method !== "string" ||
        !isObject(message.params) ||
        !Rpc.Json.is(message.params)
      ) {
        return null;
      }

      return new Notification(message.method, message.params);
    }
  }

  export namespace Notification {
    export class Server<
      T extends keyof Events.Natav.Map = keyof Events.Natav.Map,
    > extends Rpc.Notification<
      typeof Rpc.Notification.Server.Methods,
      Events.Natav.MapWithTypes[T]
    > {
      constructor(type: T, params: Events.Natav.Map[T]) {
        // TSAS: TypeScript loses the key-specific mapped type through generic object spread here.
        const notificationParams = {
          ...params,
          type,
        } as Events.Natav.MapWithTypes[T];

        super(Rpc.Notification.Server.Methods, notificationParams);
      }

      get type() {
        return this.params.type;
      }

      static is(value: Rpc.Json.Value): Rpc.Notification.Server | null {
        const notification = Notification.is(value);
        if (
          !notification ||
          notification.method !== Rpc.Notification.Server.Methods
        ) {
          return null;
        }

        const params = notification.params;
        if (!isObject(params) || typeof params.type !== "string") {
          return null;
        }

        if (typeof params.name !== "string") {
          return null;
        }

        switch (params.type) {
          case "natav:device:event":
            if (
              typeof params.name !== "string" ||
              typeof params.event !== "string" ||
              !Rpc.Json.is(params.data)
            ) {
              return null;
            }

            return new Rpc.Notification.Server("natav:device:event", {
              name: params.name,
              event: params.event,
              data: params.data,
            });
          case "natav:state:update":
            if (typeof params.name !== "string" || !isObject(params.data)) {
              return null;
            }

            return new Rpc.Notification.Server("natav:state:update", {
              name: params.name,
              data: params.data,
            });
          case "natav:device:connected":
            if (typeof params.name !== "string") {
              return null;
            }

            return new Rpc.Notification.Server("natav:device:connected", {
              name: params.name,
            });
          case "natav:device:disconnected":
            return new Rpc.Notification.Server("natav:device:disconnected", {
              name: params.name,
            });
          default:
            return null;
        }
      }
    }

    export namespace Server {
      export const Methods = "notification";
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
