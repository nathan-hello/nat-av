import type { Events } from "./events.js";

export namespace Sockets {
  export type Data = string | Uint8Array | Buffer;

  export type Address = {
    addr: string;
    port: number;
  };

  export type WriteResult = {
    bytesWritten: number;
  };

  export interface Socket {
    start(): Promise<void> | void;
    end(): Promise<void> | void;
    on<K extends keyof Events.Socket.Map>(
      event: K,
      handler: (payload: Events.Socket.Map[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): () => void;
    name: string;
  }

  export interface Connection extends Socket {
    write(data: Data): Promise<number> | number;
  }

  export interface Client extends Connection {
    // A client represents one outgoing connection.
  }

  export interface Server extends Socket {
    onConnection(handler: (connection: Connection) => void): () => void;
  }

  export interface Datagram extends Socket {
    send(data: Data, address: Address): Promise<number> | number;
    onMessage(handler: (message: DatagramMessage) => void): () => void;
  }

  export interface Multicast extends Datagram {
    join(group: Address): Promise<void> | void;
    leave(group: Address): Promise<void> | void;
  }

  export type DatagramMessage = {
    data: Buffer;
    source: Address;
  };

  export namespace Args {
    type Base = {
      encoding?: BufferEncoding;
    };

    export type Tcp = Base &
      Address & {
        // When set, enables OS-level TCP keepalive probes with this initial
        // delay (ms). Subsequent probe interval/count are governed by the OS.
        // When undefined, keepalive is disabled and the client will not
        // auto-retry on disconnect.
        keepAliveMs?: number;
        // Delay (ms) between reconnection attempts. Defaults to 5000ms.
        retryDelayMs?: number;
      };

    export type Udp = Base & Address;
  }
}
