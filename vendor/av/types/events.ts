import type { ReadableLogRecord } from "@av/telemetry/types";
import type { Rpc as NRpc } from "@av/types";
import type { Drivers } from "@av/types/drivers";

export namespace Events {
  export namespace Socket {
    export type Map = {
      debug: { data: Natav.SocketMessage };
      connected: void;
      disconnected: { error: string | undefined };
      receive: Buffer;
      error: { error: string; code?: string | number };
      transmit: { bytesWritten: number };
    };

    export type TcpMap = Map & {
      retryScheduled: { delay: number };
      timeout: void;
    };

    export type UdpMap = Map & {
      retryScheduled: { delay: number };
    };
  }

  // This namespace is not allowed to import Natav namespace.
  // The Natav namespace uses Driver for inference, so trying
  // to get the Drivers.Names<N> for example will cause a circular
  // dependency that Typescript cannot resolve.
  export namespace Driver {
    export type Map<StateData = any> = {
      "driver:state-updated": {
        data: Partial<StateData>;
      };
      "driver:delimited": string | Uint8Array | Buffer;
    };
  }

  export namespace Natav {
    type EventsFor<N extends Drivers.Array> = {
      [Name in Drivers.Names<N>]: {
        name: Name;
        event: string;
        data: NRpc.Json.Value;
      };
    }[Drivers.Names<N>];
    type StateEventFor<N extends Drivers.Array> = {
      [Name in Drivers.Names<N>]: {
        name: Name;
        data: Partial<Drivers.State<N, Name>>;
      };
    }[Drivers.Names<N>];

    export type SocketMessage = {
      traceName: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: number;
      data: Uint8Array;
      encoding: BufferEncoding | "unknown";
    };

    export type Map<N extends Drivers.Array = Drivers.Array> = {
      "natav:driver:event": EventsFor<N>;
      "natav:state:update": StateEventFor<N>;
      "natav:state:override": StateEventFor<N>;
      "natav:peer": NRpc.Server.Context;
      "natav:driver:connected": { name: Drivers.Names<N> };
      "natav:driver:disconnected": { name: Drivers.Names<N> };
      "natav:driver:error": { name: Drivers.Names<N>; error?: NRpc.Error };
      "natav:debug:socket": {
        name: Drivers.Names<N>;
        data: SocketMessage;
      };
      "natav:opentelemetry:entry": {
        record: ReadableLogRecord;
        asString: string;
      };
    };
    export type MapWithTypes<N extends Drivers.Array = Drivers.Array> = {
      [K in keyof Map<N>]: Map<N>[K] & { type: K };
    };

    export type EventUnion<N extends Drivers.Array = Drivers.Array> =
      MapWithTypes<N>[keyof MapWithTypes<N>];
  }

  export namespace Request {
    export type Map<Request, Message> = {
      delimited: Message;
      timeout: { request: Request };
      "write-error": { request: Request; error: string };
      error: {
        phase: "receive" | "match" | "send";
        error: string;
        request?: Request;
        message?: Message;
      };
    };
  }

  export namespace Rpc {
    export type Map = {
      ready: boolean;
      peer: NRpc.Server.Context;
      close: CloseEvent;
      error:
        | { reason: "transport"; event: Event }
        | { reason: "init-promises-threw"; error: Error }
        | { reason: "json-parse-failed"; raw: string }
        | { reason: "rpc-error"; error: NRpc.Error };
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
      N extends Drivers.Array = Drivers.Array,
      Name extends Drivers.Names<N> = Drivers.Names<N>,
    > = {
      change: {
        name: Name;
        state: Drivers.State<N, Name> | undefined;
      };
      "before:request": DriverEventBase &
        BeforePayload<RequestMethodInfo<Drivers.Api<N, Name>>>;

      "after:response": DriverEventBase &
        (
          | OkPayload<RequestMethodInfo<Drivers.Api<N, Name>>>
          | {
              method: MethodNames<Drivers.Api<N, Name>>;
              error: NRpc.Error;
            }
        );
      "after:response:ok": DriverEventBase &
        OkPayload<RequestMethodInfo<Drivers.Api<N, Name>>>;
      "after:response:error": DriverEventBase & {
        method: MethodNames<Drivers.Api<N, Name>>;
        error: NRpc.Error;
      };
    };
  }
}
