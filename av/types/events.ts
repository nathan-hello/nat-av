import type { ReadableLogRecord } from "@av/telemetry/types";
import type { DebugSocketEvent } from "@av/rpc/debug/types";
import type { natav } from "@av/index";
import type { Natav } from "@av/types";

export namespace Events {
  type StateEventFor<N extends Natav.Orch = any> = {
    [Name in Natav.Names<N>]: {
      name: Name;
      data: Partial<Natav.State<N, Name>>;
    };
  }[Natav.Names<N>];
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
    export type Map<N extends Natav.Orch = natav> = {
      "natav:state:update": StateEventFor<N>;
      "natav:state:override": StateEventFor<N>;
      "natav:device:connected": { name: Natav.Names<N> };
      "natav:device:disconnected": { name: Natav.Names<N> };
      "natav:device:error": { name: Natav.Names<N>; error?: Error | unknown };
      "natav:debug:socket": { data: DebugSocketEvent };
      "natav:opentelemetry:entry": {
        record: ReadableLogRecord;
        asString: string;
      };
    };
  }
  export namespace Request {
    export type Map<Request, Message> = {
      message: Message;
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
}
