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
      keepAlive: boolean;
    };

    export type Udp = Base & {
      addr: string;
      port: number;
    };
  }
}
