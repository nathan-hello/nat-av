import type { ReadableLogRecord } from "@av/telemetry/types";
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
        data: any;
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
      "natav:driver:connected": { name: Drivers.Names<N> };
      "natav:driver:disconnected": { name: Drivers.Names<N> };
      "natav:driver:error": {
        caughtBy: string;
        name: Drivers.Names<N>;
        error?: Error;
      };
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
      "write-error": { request: Request; error: Error };
      error: {
        phase: "receive" | "match" | "send";
        error: Error;
        request?: Request;
        message?: Message;
      };
    };
  }
}
