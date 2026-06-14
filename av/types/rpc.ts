import type { System } from "@av/system";
import type { LogEntry } from "@av/telemetry/types";
import type { Natav } from "@av/types/natav";

export namespace Rpc {
  export type PendingRequest = {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  };

  export type TransportOptions = {
    reconnect?: boolean;
    retryDelay?: number;
  };

  export namespace System {
    export type State<N extends Natav.Orch> = System<N>["state"];
    export type Api<N extends Natav.Orch> = {
      [M in keyof System<N>["api"]]: System<N>["api"][M] extends (
        (...args: infer Args) => infer R
      ) ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };

    export type ClientHandle<N extends Natav.Orch> = {
      api: Api<N>;
      readonly state: Promise<State<N>>;
      isPending(method: keyof Api<N>): boolean;
      pendingCount(method: keyof Api<N>): number;
    };

    export const Methods = {
      SystemApi: "system.api",
      SystemState: "system.state",
    } as const;
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
    export type Encoding = "utf8";

    export type Descriptor = {
      traceName: string;
      canWrite: boolean;
      canReceive: boolean;
    };

    export type Node = {
      name: string;
      driverName: string;
      children: Node[];
      socket?: Descriptor;
    };

    export type SocketMessage = {
      device: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: string;
      traceName: string;
      encoding: Encoding;
      text: string;
      hex: string;
      length: number;
    };

    export const Methods = {
      GetTree: "debug.tree.get",
      WriteSocket: "debug.socket.write",
    } as const;

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

  export type Api<
    N extends Natav.Orch,
    Name extends Natav.Names<N>,
  > = FilterApi<Natav.Api<N, Name>>;

  export const Methods = {
    Notification: "notification",
    ...Device.Methods,
    ...System.Methods,
    ...Debug.Methods,
  } as const;
}
