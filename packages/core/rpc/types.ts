import type { Natav, Events as NEvents } from "../index.js";
import type { RpcClient } from "./client/index.js";
import type { TypedEventTarget } from "../lib/eventtarget.js";

export namespace Rpc {
  export namespace Json {
    const TAG_KEY = "__rpc_t__";
    const VAL_KEY = "__rpc_v__";

    export function is(value: unknown): value is Rpc.Json.Value {
      if (
        value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return true;
      }

      if (value instanceof Map) {
        for (const [k, v] of value) {
          if (!is(k) || !is(v)) return false;
        }
        return true;
      }

      if (value instanceof Uint8Array) {
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
      value:
        | Value
        | Rpc.Request
        | Rpc.Response
        | Rpc.Error.Response
        | Rpc.Notification,
    ): string {
      return globalThis.JSON.stringify(value, replacer);
    }

    export function parse(value: string): Value {
      return globalThis.JSON.parse(value, reviver);
    }

    function replacer(this: unknown, _key: string, value: unknown): unknown {
      if (value === undefined) {
        value = null;
      }
      if (value instanceof Map) {
        return { [TAG_KEY]: "map", [VAL_KEY]: [...value.entries()] };
      }
      if (value instanceof Uint8Array) {
        return { [TAG_KEY]: "u8", [VAL_KEY]: [...value] };
      }
      // TSAS: Node's Buffer.toJSON runs before the replacer, leaving { type: "Buffer", data: number[] }.
      if (
        isObject(value) &&
        value.type === "Buffer" &&
        Array.isArray(value.data)
      ) {
        return { [TAG_KEY]: "u8", [VAL_KEY]: value.data };
      }
      return value;
    }

    function reviver(this: unknown, _key: string, value: unknown): unknown {
      if (
        isObject(value) &&
        TAG_KEY in value &&
        VAL_KEY in value &&
        typeof value[TAG_KEY] === "string"
      ) {
        switch (value[TAG_KEY]) {
          case "map":
            // TSAS: "map" payloads are emitted only by replacer as an iterable of [key, value] pairs.
            return new Map(value[VAL_KEY] as Iterable<[unknown, unknown]>);
          case "u8":
            // TSAS: "u8" payloads are emitted only by replacer as an array of byte numbers.
            return new Uint8Array(value[VAL_KEY] as number[]);
        }
      }
      return value;
    }

    export type Value =
      | null
      | undefined
      | boolean
      | number
      | string
      | Uint8Array
      | Map<Value, Value>
      | Value[]
      | readonly Value[]
      | { [key: string]: Value };

    export type IsJSON<T> =
      T extends Value ?
        [T] extends [never] ?
          false
        : true
      : false;
  }

  export type Never = {
    readonly __rpc_never__: "This value cannot cross the RPC boundary";
  };

  export type Void = undefined;

  export type Box<T> = {
    data: T;
    error: Rpc.Error | undefined;
  };

  type Value<T> =
    [T] extends [Json.Value] ? T
    : T extends Map<infer Key, infer Entry> ? Map<Value<Key>, Value<Entry>>
    : T extends readonly unknown[] ? { [K in keyof T]: Value<T[K]> }
    : T extends (...args: any[]) => any ? Never
    : T extends Record<string, unknown> ? { [K in keyof T]: Value<T[K]> }
    : Never;

  type ReturnValue<T> = [T] extends [void] ? Void : Value<Awaited<T>>;

  type StateRecord<T extends Record<string, unknown>> = {
    [K in keyof T]: Value<T[K]>;
  };

  type ApiRecord<T> = {
    [K in keyof T]: T[K] extends (...args: infer Args) => infer Result ?
      (
        ...args: { [I in keyof Args]: Value<Args[I]> }
      ) => Promise<Box<ReturnValue<Result>>>
    : T[K] extends Record<string, unknown> ? ApiRecord<T[K]>
    : Never;
  };

  export type Api<S extends Natav.Shape> = ApiRecord<S["api"]>;

  export type State<S extends Natav.Shape> = StateRecord<S["state"]>;

  export type Subscription = {
    off(): Promise<Box<Void>>;
  };

  export type EventSubscription = Box<Subscription>;

  /** The client-side projection of one managed driver or plugin. */
  export type Proxy<S extends Natav.Shape> = {
    readonly deps: {
      readonly [K in keyof S["deps"]]: S["deps"][K] extends Natav.Shape ?
        Proxy<S["deps"][K]>
      : never;
    };
    readonly name: S["name"];
    readonly api: Api<S>;
    readonly state: State<S>;
    readonly events: S["events"];
    readonly on: TypedEventTarget<
      Events.DriverMap<readonly [S], S["name"]>
    >["on"];
    readonly once: TypedEventTarget<
      Events.DriverMap<readonly [S], S["name"]>
    >["once"];
    readonly event: Client.Events.Handle<readonly [S], S["name"]>;
    readonly isPending: (method: string) => boolean;
    readonly pendingCount: (method: string) => number;
    dep<Name extends Natav.ManagedDepNames<readonly [S], S["name"]>>(
      name: Name,
    ): Proxy<Natav.FromName<readonly [S["deps"][number]], Name>>;
  };

  export namespace Client {
    export type PendingRequest = {
      resolve: (result: any) => void;
      reject: (error: Rpc.Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    };
    export namespace Events {
      export type Callback<
        N extends Natav.Array,
        Name extends Natav.Names<N>,
        K extends keyof Natav.Events<N, Name> & string,
      > = (payload: Natav.Events<N, Name>[K]) => void;

      export type Handle<N extends Natav.Array, Name extends Natav.Names<N>> = {
        on<K extends keyof Natav.Events<N, Name> & string>(
          event: K,
          callback: Callback<N, Name, K>,
        ): Promise<Rpc.EventSubscription>;
      };
      export type State = {
        callbacks: Set<(payload: any) => void>;
        subscribed: boolean;
        pendingSubscribe: Promise<void> | undefined;
        pendingUnsubscribe: Promise<void> | undefined;
      };
    }
    export type State<
      N extends Natav.Array,
      Name extends Natav.Names<N>,
    > = Rpc.State<Natav.FromName<N, Name>>;

    export type Api<
      N extends Natav.Array = Natav.Array,
      Name extends string = Natav.Names<N>,
    > = Rpc.Api<Natav.FromName<N, Name>>;

    export type Handle<N extends Natav.Runtime> = Pick<
      RpcClient<N>,
      "isOnline"
    > & {
      driver<Route extends Path<N>>(path: Route): Result<N, Route>;
      plugin<Name extends Natav.Names<N["plugins"]>>(
        name: Name,
      ): Rpc.Proxy<Natav.FromName<N["plugins"], Name>>;
      find: Find<N>;
      drivers(): Group<N, "">;
      plugins(): Group<N, "">;
    };

    export type Path<N extends Natav.Runtime> =
      Natav.Names<N["drivers"]> | Natav.GroupPaths<N["input"]>;

    export type Result<N extends Natav.Runtime, Route extends Path<N>> =
      string extends Route ? Rpc.Proxy<N["drivers"][number]>
      : Route extends Natav.GroupPaths<N["input"]> ?
        Group<N, GroupInputAtPath<N["input"], Route>>
      : Route extends Natav.Names<N["drivers"]> ?
        Rpc.Proxy<Natav.FromName<N["drivers"], Route>>
      : never;

    export type Find<N extends Natav.Runtime> = {
      driver<Cast = never, Path extends string = string>(
        path: Path,
      ): [Cast] extends [never] ?
        Path extends `/${string}` ?
          DynamicGroup<N>
        : Natav.Shape
      : Cast;
      plugin<Cast = Natav.Shape>(path: string): Cast;
    };

    export type GroupInputAtPath<Input, Path extends string> =
      Input extends readonly unknown[] ? GroupInputAtPath<Input[number], Path>
      : Path extends `/${infer Head}/${infer Tail}` ?
        Input extends Record<Head, infer Child> ?
          GroupInputAtPath<Child, `/${Tail}`>
        : never
      : Path extends `/${infer Head}` ?
        Input extends Record<Head, infer Child> ?
          Child
        : never
      : never;

    export type GroupLeaf<
      N extends Natav.Runtime,
      Input extends readonly Natav.Shape[],
    > =
      Input extends readonly [infer Only extends Natav.Shape] ? Rpc.Proxy<Only>
      : Rpc.Proxy<Input[number]>[];

    export type Group<N extends Natav.Runtime, Input = Natav.GroupInput> = {
      array(): Input extends "" ? Rpc.Proxy<N["drivers"][number]>[]
      : Rpc.Proxy<Natav.InputDrivers<Input>>[];
    } & (Input extends Record<string, unknown> ?
      {
        [Name in keyof Input & string]: Input[Name] extends (
          readonly Natav.Shape[]
        ) ?
          GroupLeaf<N, Input[Name]>
        : Input[Name] extends Record<string, unknown> ? Group<N, Input[Name]>
        : never;
      }
    : {});

    export type DynamicGroup<N extends Natav.Runtime> = {
      array(): Promise<Rpc.Proxy<N["drivers"][number]>[]>;
    };

    export type Drivers<N extends Natav.Runtime> = {
      <Route extends Path<N>>(path: Route): Result<N, Route>;
    } & {
      [Name in Natav.Names<N["drivers"]>]: Rpc.Proxy<
        Natav.FromName<N["drivers"], Name>
      >;
    };

    export type Plugins<N extends Natav.Runtime> = {
      <Name extends Natav.Names<N["plugins"]>>(
        name: Name,
      ): Rpc.Proxy<Natav.FromName<N["plugins"], Name>>;
    } & {
      [Name in Natav.Names<N["plugins"]>]: Rpc.Proxy<
        Natav.FromName<N["plugins"], Name>
      >;
    };
  }

  export type Id = string | number;

  const REQUEST_METHOD = {
    DriverCall: "driver.call",
    DriverSubscribe: "driver.events.subscribe",
    DriverUnsubscribe: "driver.events.unsubscribe",
    DriverInit: "driver.init",
    CatalogList: "catalog.list",
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

    error(error: Rpc.Error.Payload): Rpc.Error {
      return new Rpc.Error(error, { scope: "server" }, this.id);
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
      return new Rpc.Request<
        typeof REQUEST_METHOD.DriverCall,
        Rpc.Request.DriverParams,
        Rpc.Json.Value
      >(id, REQUEST_METHOD.DriverCall, normalizeDriverParams(params));
    }

    static driverSubscribe(id: Id, params: DriverParamsInput) {
      return new Rpc.Request<
        typeof REQUEST_METHOD.DriverSubscribe,
        Rpc.Request.DriverParams,
        null
      >(id, REQUEST_METHOD.DriverSubscribe, normalizeDriverParams(params));
    }

    static driverUnsubscribe(id: Id, params: DriverParamsInput) {
      return new Rpc.Request<
        typeof REQUEST_METHOD.DriverUnsubscribe,
        Rpc.Request.DriverParams,
        null
      >(id, REQUEST_METHOD.DriverUnsubscribe, normalizeDriverParams(params));
    }

    static driverInit(id: Id) {
      return new Rpc.Request<
        typeof REQUEST_METHOD.DriverInit,
        undefined,
        Rpc.Request.DriverInitResult
      >(id, REQUEST_METHOD.DriverInit);
    }

    static catalogList(id: Id, path: string) {
      return new Rpc.Request<
        typeof REQUEST_METHOD.CatalogList,
        { path: string },
        Rpc.Request.CatalogListResult
      >(id, REQUEST_METHOD.CatalogList, { path });
    }
  }

  export namespace Request {
    export const Methods = REQUEST_METHOD;
    export type DriverParams = {
      driver: string;
      method: string;
      args: any[];
    };
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
      result: DriverInitResult;
    };
    export type DriverInitResult = {
      states: {
        drivers: Record<string, Rpc.Json.Value>;
        plugins: Record<string, Rpc.Json.Value>;
      };
      names: readonly string[];
      groups: Record<string, readonly string[]>;
      plugins: readonly string[];
    };
    export type CatalogListEntry = { name: string };
    export type CatalogListResult = readonly CatalogListEntry[];
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

  export class Error extends globalThis.Error {
    readonly cause: unknown;
    readonly origin: Rpc.Error.Origin;
    readonly id: Id | null;

    constructor(cause: unknown, origin: Rpc.Error.Origin, id: Id | null) {
      super(cause instanceof globalThis.Error ? cause.message : "RPC error", {
        cause,
      });
      this.cause = cause;
      this.origin = origin;
      this.id = id;

      if (cause instanceof globalThis.Error) {
        this.name = cause.name;
        this.stack = cause.stack;
      }
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
        name?: unknown;
        scope?: unknown;
      };

      if (
        typeof error.code !== "number" ||
        typeof error.message !== "string" ||
        (error.scope !== "driver" &&
          error.scope !== "plugin" &&
          error.scope !== "natav" &&
          error.scope !== "server" &&
          error.scope !== "client")
      ) {
        return null;
      }

      return new Rpc.Error(
        {
          code: error.code,
          message: error.message,
          ...("data" in error ? { data: error.data } : {}),
        },
        {
          scope: error.scope,
          ...(typeof error.name === "string" ? { name: error.name } : {}),
        },
        message.id,
      );
    }
  }

  export namespace Error {
    export type Scope = "driver" | "plugin" | "natav" | "server" | "client";

    export type Origin = {
      scope: Scope;
      name?: string;
    };

    export type Payload = {
      code: number;
      message: string;
      data?: unknown;
    };

    export type Response = {
      readonly jsonrpc: "2.0";
      readonly id: Id | null;
      readonly error: {
        readonly code: number;
        readonly message: string;
        readonly data?: Rpc.Json.Value;
        readonly scope: Scope;
        readonly name?: string;
      };
    };
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
      T extends keyof NEvents.Natav.Map = keyof NEvents.Natav.Map,
    > extends Rpc.Notification<
      typeof Rpc.Notification.Server.Methods,
      NEvents.Natav.MapWithTypes[T]
    > {
      constructor(type: T, params: NEvents.Natav.Map[T]) {
        // TSAS: TypeScript loses the key-specific mapped type through generic object spread here.
        const notificationParams = {
          ...params,
          type,
        } as NEvents.Natav.MapWithTypes[T];

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
        [K in keyof NEvents.Natav.Map]: Rpc.Notification.Server<K>;
      }[keyof NEvents.Natav.Map];

      export const Methods = "notification";
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
          error(ws: Peer, error: globalThis.Error): void;
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

  export namespace Events {
    export type Map = {
      ready: boolean;
      close: CloseEvent;
      error:
        | { reason: "transport"; event: Event }
        | { reason: "init-promises-threw"; error: Error }
        | { reason: "json-parse-failed"; raw: string }
        | { reason: "rpc-error"; error: Rpc.Error };
      change: { name?: string };
    };

    export type DriverEventBase = {
      id: number;
    };

    type RequestMethodInfo<T, Prefix extends string = ""> = {
      [K in keyof T & string]: T[K] extends (...args: infer A) => infer R ?
        {
          method: `${Prefix}${K}`;
          args: A;
          data: R extends Promise<infer D> ? D : R;
        }
      : T[K] extends object ? RequestMethodInfo<T[K], `${Prefix}${K}/`>
      : never;
    }[keyof T & string];

    type BeforePayload<T> =
      T extends { method: string; args: any[] } ? Pick<T, "method" | "args">
      : never;

    type OkPayload<T> =
      T extends { method: string; data: any } ? Pick<T, "method" | "data">
      : never;

    type MethodNames<T, Prefix extends string = ""> = {
      [K in keyof T & string]: T[K] extends (...args: any[]) => any ?
        `${Prefix}${K}`
      : T[K] extends object ? MethodNames<T[K], `${Prefix}${K}/`>
      : never;
    }[keyof T & string];

    export type DriverMap<
      N extends readonly Natav.Shape[] = Natav.Array,
      Name extends Natav.Names<N> = Natav.Names<N>,
    > = {
      change: {
        name: Name;
        state: Natav.State<N, Name> | undefined;
      };
      "before:request": DriverEventBase &
        BeforePayload<RequestMethodInfo<Natav.Api<N, Name>>>;

      "after:response": DriverEventBase &
        (
          | OkPayload<RequestMethodInfo<Natav.Api<N, Name>>>
          | {
              method: MethodNames<Natav.Api<N, Name>>;
              error: Rpc.Error;
            }
        );
      "after:response:ok": DriverEventBase &
        OkPayload<RequestMethodInfo<Natav.Api<N, Name>>>;
      "after:response:error": DriverEventBase & {
        method: MethodNames<Natav.Api<N, Name>>;
        error: Rpc.Error;
      };
    };
  }
}
