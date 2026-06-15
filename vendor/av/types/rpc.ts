import type { LogEntry } from "@av/telemetry/types";
import type { Drivers } from "@av/types/drivers";

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
}
