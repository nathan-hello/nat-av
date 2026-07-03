import type { Events } from "@av/types/events";

export namespace Sockets {
  export type WriteResult = {
    bytesWritten: number;
  };

  export interface Client {
    start(): Promise<void> | void;
    end(): Promise<void> | void;
    write(data: string | Uint8Array | Buffer): Promise<number> | number;
    on<K extends keyof Events.Socket.Map>(
      event: K,
      handler: (payload: Events.Socket.Map[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): () => void;
    name: string;
  }

  export namespace Args {
    type Base = {
      encoding?: BufferEncoding;
    };

    export type Tcp = Base & {
      addr: string;
      port: number;
      // When set, enables OS-level TCP keepalive probes with this initial
      // delay (ms). Subsequent probe interval/count are governed by the OS.
      // When undefined, keepalive is disabled and the client will not
      // auto-retry on disconnect.
      keepAliveMs?: number;
      // Delay (ms) between reconnection attempts. Defaults to 5000ms.
      retryDelayMs?: number;
    };

    export type Udp = Base & {
      addr: string;
      port: number;
    };
  }
}
