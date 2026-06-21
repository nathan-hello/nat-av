import type { Manager } from "@av/drivers";
import type { RpcClient } from "@av/rpc/client";
import type { ClientRpcDriver } from "@av/rpc/client/driver";
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
    export function stringify(
      value: Value | Rpc.Request | Rpc.Response | Rpc.Error | Rpc.Notification,
    ): string {
      return globalThis.JSON.stringify(value);
    }

    export function parse(value: string | unknown): Value {
      return globalThis.JSON.parse(value as any);
    }

    export type Value =
      | null
      | boolean
      | number
      | string
      | Value[]
      | { [key: string]: Value };

    export type IsJSON<T> =
      T extends Value ?
        [T] extends [never] ?
          false
        : true
      : false;
  }

  export namespace Client {
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
    > = Drivers.State<N, Name>;

    export type Api<
      N extends Drivers.Array = Drivers.Array,
      Name extends Drivers.Names<N> = Drivers.Names<N>,
    > = Drivers.Api<N, Name>;

    export type Handle<N extends Manager> = Pick<RpcClient<N>, "ctx"> & {
      driver<Name extends Drivers.Names<N["configs"]>>(
        name: Name,
      ): DriverHandle<N, Name>;
    };

    export type DriverHandle<
      N extends Manager,
      Name extends Drivers.Names<N["configs"]>,
    > = Pick<
      ClientRpcDriver<N, Name>,
      "api" | "state" | "on" | "event" | "once" | "pendingCount"
    > & {
      dep: <DepName extends Drivers.DepNames<N, Name>>(
        depName: DepName,
      ) => DriverHandle<N, DepName>;
    };
  }

  type Id = string | number;

  const REQUEST_METHOD = {
    DriverCall: "driver.call",
    DriverSubscribe: "driver.events.subscribe",
    DriverUnsubscribe: "driver.events.unsubscribe",
    DriverInit: "driver.init",
  } as const;

  type DriverParamsInput = {
    driver: string;
    method: string;
    args?: any[];
  };

  function normalizeDriverParams(
    params: DriverParamsInput,
  ): Rpc.Request.DriverParams {
    return {
      driver: params.driver,
      method: params.method,
      args: Array.isArray(params.args) ? params.args : [],
    };
  }

  function parseDriverParams(value: unknown): Rpc.Request.DriverParams | null {
    if (!isObject(value)) {
      return null;
    }

    // TSAS: The runtime checks above ensure this params object can be inspected by key.
    const params = value as {
      driver?: unknown;
      method?: unknown;
      args?: unknown;
    };

    if (
      typeof params.driver !== "string" ||
      typeof params.method !== "string"
    ) {
      return null;
    }

    return {
      driver: params.driver,
      method: params.method,
      args: Array.isArray(params.args) ? params.args : [],
    };
  }

  export class Request<
    Method extends string = string,
    Params extends Rpc.Json.Value = Rpc.Json.Value,
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

    DriverParams(): Request.DriverParams | null {
      if (
        this.method !== REQUEST_METHOD.DriverCall &&
        this.method !== REQUEST_METHOD.DriverSubscribe &&
        this.method !== REQUEST_METHOD.DriverUnsubscribe
      ) {
        return null;
      }

      return parseDriverParams(this.params);
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

    static driverCall(id: Id, params: DriverParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DriverCall,
        normalizeDriverParams(params),
      );
    }

    static driverSubscribe(id: Id, params: DriverParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DriverSubscribe,
        normalizeDriverParams(params),
      );
    }

    static driverUnsubscribe(id: Id, params: DriverParamsInput) {
      return new Rpc.Request(
        id,
        REQUEST_METHOD.DriverUnsubscribe,
        normalizeDriverParams(params),
      );
    }

    static driverInit(id: Id) {
      return new Rpc.Request(id, REQUEST_METHOD.DriverInit);
    }
  }

  export namespace Request {
    export const Methods = REQUEST_METHOD;
    export type DriverParams = { driver: string; method: string; args: any[] };
    export type DriverCall = {
      method: typeof REQUEST_METHOD.DriverCall;
      params: Rpc.Request.DriverParams;
      result: Rpc.Json.Value;
    };
    export type DriverSubscribe = {
      method: typeof REQUEST_METHOD.DriverSubscribe;
      params: Rpc.Request.DriverParams;
      result: null;
    };
    export type DriverUnsubscribe = {
      method: typeof REQUEST_METHOD.DriverUnsubscribe;
      params: Rpc.Request.DriverParams;
      result: null;
    };
    export type DriverInit = {
      method: typeof REQUEST_METHOD.DriverInit;
      params: undefined;
      result: { context: Rpc.Server.Context; states: Record<string, unknown> };
    };
    export type ResultOf<TRequest extends Rpc.Request> =
      TRequest extends Rpc.Request<string, Rpc.Json.Value, infer ResultType> ?
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
        !("result" in message) ||
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

    toString(): string {
      return `Rpc.Error(${this.error.code}): ${this.error.message}`;
    }

    static is(message: Rpc.Json.Value): Rpc.Error | null {
      if (
        message === null ||
        typeof message !== "object" ||
        !message ||
        !("jsonrpc" in message) ||
        message.jsonrpc !== "2.0" ||
        !("id" in message) ||
        (message.id !== null &&
          typeof message.id !== "string" &&
          typeof message.id !== "number") ||
        !("error" in message) ||
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
      DriverNotFound: -32001,
      DriverMethodNotFound: -32002,
      DriverCallFailed: -32003,
      RequestTimeout: -35000,
      RequestsShutdown: -35001,
      RpcTimeout: -32004,
      RpcDisconnected: -32005,
      CtxNotFound: -36001,
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

      get type(): T {
        return this.params.type;
      }

      static from(value: Notification): Rpc.Notification.Server.Any | null {
        return Rpc.Notification.Server.fromNotification(value);
      }

      static is(value: Rpc.Json.Value): Rpc.Notification.Server.Any | null {
        const notification = Notification.is(value);
        if (!notification) {
          return null;
        }

        return Rpc.Notification.Server.fromNotification(notification);
      }

      private static fromNotification(
        notification: Notification,
      ): Rpc.Notification.Server.Any | null {
        if (notification.method !== Rpc.Notification.Server.Methods) {
          return null;
        }

        const params = notification.params;
        if (!isObject(params) || typeof params.type !== "string") {
          return null;
        }

        switch (params.type) {
          case "natav:peer":
            if (
              typeof params.addr !== "string" ||
              typeof params.clientId !== "string"
            ) {
              return null;
            }

            return new Rpc.Notification.Server("natav:peer", {
              addr: params.addr,
              name: params.clientId,
            });
          case "natav:driver:event":
            if (typeof params.name !== "string") {
              return null;
            }
            if (typeof params.event !== "string" || !Rpc.Json.is(params.data)) {
              return null;
            }

            return new Rpc.Notification.Server("natav:driver:event", {
              name: params.name,
              event: params.event,
              data: params.data,
            });
          case "natav:state:update":
            if (typeof params.name !== "string") {
              return null;
            }
            if (typeof params.name !== "string" || !isObject(params.data)) {
              return null;
            }

            return new Rpc.Notification.Server("natav:state:update", {
              name: params.name,
              data: params.data,
            });
          case "natav:driver:connected":
            if (typeof params.name !== "string") {
              return null;
            }
            return new Rpc.Notification.Server("natav:driver:connected", {
              name: params.name,
            });
          case "natav:driver:disconnected":
            if (typeof params.name !== "string") {
              return null;
            }
            return new Rpc.Notification.Server("natav:driver:disconnected", {
              name: params.name,
            });
          default:
            return null;
        }
      }
    }

    export namespace Server {
      export type Any = {
        [K in keyof Events.Natav.Map]: Rpc.Notification.Server<K>;
      }[keyof Events.Natav.Map];

      export const Methods = "notification";
    }
  }

  export namespace Server {
    export type Context<ClientId extends string = string> = {
      addr: string;
      name: ClientId;
    };
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
}
