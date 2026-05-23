import type { Events } from "@av/types/events";

export type Protocols = "tcp" | "udp" | "ssh" | "telnet" | "http" | "mock";

export type ParsedData<T = any> = {
  data: T;
  raw: Buffer;
  timestamp: Date;
};

export type WriteResult = {
  bytesWritten: number;
};

export interface DeviceSocket {
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
