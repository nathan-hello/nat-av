import type { natav } from "@av/index";
import type { RPCError } from "@av/rpc/protocol";
import type { ReadableLogRecord } from "@av/telemetry/types";
import type { Natav, Rpc as NRpc } from "@av/types";

export namespace Events {
  export namespace Socket {
    export type Map = {
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
  // to get the Natav.Names<N> for example will cause a circular
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

  export namespace System {
    type EventsFor<N extends Natav.Orch> = {
      [Name in Natav.Names<N>]: {
        name: Name;
        event: string;
        data: NRpc.JSONValue;
      };
    }[Natav.Names<N>];
    type StateEventFor<N extends Natav.Orch> = {
      [Name in Natav.Names<N>]: {
        name: Name;
        data: Partial<Natav.State<N, Name>>;
      };
    }[Natav.Names<N>];

    export type Map<N extends Natav.Orch = natav> = {
      "natav:device:event": EventsFor<N>;
      "natav:state:update": StateEventFor<N>;
      "natav:state:override": StateEventFor<N>;
      "natav:device:connected": { name: Natav.Names<N> };
      "natav:device:disconnected": { name: Natav.Names<N> };
      "natav:device:error": { name: Natav.Names<N>; error?: Error | unknown };
      "natav:debug:socket": { data: Rpc.DebugMap };
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

    export type SystemMap = {
      change: { state: Promise<NRpc.System.State> | undefined };
    };

    export type DeviceMap<N extends Natav.Orch, Name extends Natav.Names<N>> = {
      change: {
        name: Name;
        state: Natav.State<N, Name> | undefined;
      };
    };

    export type DebugMap = {
      traceName: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: string;
      encoding: NRpc.Debug.Encoding;
      text: string;
      hex: string;
      length: number;
    };
  }
}
