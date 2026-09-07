import type { ReadableLogRecord } from "../telemetry/types.js";
import type { Natav as NatavTypes } from "./drivers.js";

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
  // The Natav namespace uses its driver shape for inference, so trying
  // to get the Natav.Names<N> for example will cause a circular
  // dependency that Typescript cannot resolve.
  export namespace Driver {
    export type Map<StateData> = {
      "driver:state-updated": {
        data: Partial<StateData>;
      };
      "driver:delimited": string | Uint8Array | Buffer;
    };
  }

  export namespace Natav {
    type EventsFor<N extends NatavTypes.Array> = {
      [Name in NatavTypes.Names<N>]: {
        name: Name;
        event: string;
        data: any;
      };
    }[NatavTypes.Names<N>];
    type StateEventFor<N extends NatavTypes.Array> = {
      [Name in NatavTypes.Names<N>]: {
        name: Name;
        data: Partial<NatavTypes.State<N, Name>>;
      };
    }[NatavTypes.Names<N>];

    export type SocketMessage = {
      traceName: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: number;
      data: Uint8Array;
      encoding: BufferEncoding | "unknown";
    };

    export type Map<N extends NatavTypes.Array = NatavTypes.Array> = {
      "natav:driver:event": EventsFor<N>;
      "natav:state:update": StateEventFor<N>;
      "natav:state:override": StateEventFor<N>;
      "natav:driver:connected": { name: NatavTypes.Names<N> };
      "natav:driver:disconnected": { name: NatavTypes.Names<N> };
      "natav:driver:error": {
        caughtBy: string;
        name: NatavTypes.Names<N>;
        error?: Error;
      };
      "natav:debug:socket": {
        name: NatavTypes.Names<N>;
        data: SocketMessage;
      };
      "natav:opentelemetry:entry": {
        record: ReadableLogRecord;
        asString: string;
      };
    };
    export type MapWithTypes<N extends NatavTypes.Array = NatavTypes.Array> = {
      [K in keyof Map<N>]: Map<N>[K] & { type: K };
    };

    export type EventUnion<N extends NatavTypes.Array = NatavTypes.Array> =
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
