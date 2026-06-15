import type { RPCError } from "@av/rpc/protocol";
import type { ReadableLogRecord } from "@av/telemetry/types";
import type { Rpc as NRpc } from "@av/types";
import type { Drivers } from "@av/types/drivers";

export namespace Events {
  export namespace Socket {
    export type Map = {
      debug: { data: NRpc.Debug.SocketMessage };
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
      "driver:delimited": Buffer;
      "socket:bubbled": Socket.Map;
    };
  }

  export namespace Natav {
    type EventsFor<N extends Drivers.Array> = {
      [Name in Drivers.Names<N>]: {
        name: Name;
        event: string;
        data: NRpc.JSONValue;
      };
    }[Drivers.Names<N>];
    type StateEventFor<N extends Drivers.Array> = {
      [Name in Drivers.Names<N>]: {
        name: Name;
        data: Partial<Drivers.State<N, Name>>;
      };
    }[Drivers.Names<N>];

    export type Map<N extends Drivers.Array = Drivers.Array> = {
      "natav:device:event": EventsFor<N>;
      "natav:state:update": StateEventFor<N>;
      "natav:state:override": StateEventFor<N>;
      "natav:device:connected": { name: Drivers.Names<N> };
      "natav:device:disconnected": { name: Drivers.Names<N> };
      "natav:device:error": { name: Drivers.Names<N>; error?: Error | unknown };
      "natav:debug:socket": {
        name: Drivers.Names<N>;
        data: NRpc.Debug.SocketMessage;
      };
      "natav:opentelemetry:entry": {
        record: ReadableLogRecord;
        asString: string;
      };
    };
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
      close: CloseEvent;
      error:
        | { reason: "transport"; event: Event }
        | { reason: "init-promises-threw"; error: Error }
        | { reason: "json-parse-failed"; raw: string }
        | { reason: "rpc-error"; error: RPCError };
      change: { name?: string };
    };

    export type DeviceMap<
      N extends Drivers.Array = Drivers.Array,
      Name extends Drivers.Names<N> = Drivers.Names<N>,
    > = {
      change: {
        name: Name;
        state: Drivers.State<N, Name> | undefined;
      };
    };
  }
}
