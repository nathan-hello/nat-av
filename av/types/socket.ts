
export type Protocols = "tcp" | "udp" | "ssh" | "telnet" | "http" | "mock";

export type ParsedData<T = any> = {
  data: T;
  raw: Buffer;
  timestamp: Date;
};

export type WriteResult = {
  bytesWritten: number;
};

export type SocketEventMap = {
  connected: void;
  disconnected: { error: string | undefined };
  receive: Buffer;
  error: { error: string; code?: string | number };
  transmit: { bytesWritten: number };
};

export interface DeviceSocket {
  start(): Promise<void> | void;
  end(): Promise<void> | void;
  write(data: string | Uint8Array | Buffer): Promise<number> | number;
  on<K extends keyof SocketEventMap>(
    event: K,
    handler: (payload: SocketEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  name: string;
}

