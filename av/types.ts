import type { Driver } from "./driver";

export type Protocols = "tcp" | "udp" | "ssh" | "telnet" | "http" | "mock";

export type DriverEvents<StateData = any> = {
  "driver:state-updated": Partial<StateData>;
  "socket:bubbled": SocketEventMap;
};

export type ParsedData<T = any> = {
  data: T;
  raw: Buffer;
  timestamp: Date;
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
  ): DeviceSocket;
  name: string;
}

export type NamesOf<C extends readonly Driver[]> = C[number]["name"];

export type DriverFor<C extends readonly Driver[], N extends NamesOf<C>> =
  Extract<C[number], { name: N }>;

export type StateFor<C extends readonly Driver[], N extends NamesOf<C>> =
  DriverFor<C, N>["state"];

export type ApiFor<C extends readonly Driver[], N extends NamesOf<C>> = {
  [M in keyof DriverFor<C, N>["api"]]: DriverFor<C, N>["api"][M] extends (
    (...args: infer Args) => infer R
  ) ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

export type DepsOf<C extends readonly Driver[], N extends NamesOf<C>> =
  DriverFor<C, N>["deps"];

type IsAny<T> = 0 extends (1 & T) ? true : false;

export type DepNamesOf<C extends readonly Driver[], N extends NamesOf<C>> =
  IsAny<DepsOf<C, N>[number]> extends true ? never
  : DepsOf<C, N>[number] extends Driver<infer DepName> ? DepName
  : never;

export type DepFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
  DN extends DepNamesOf<C, N>,
> = Extract<DepsOf<C, N>[number], { name: DN }>;

type PromisifyApi<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer Args) => infer R
    ? (...args: Args) => Promise<Awaited<R>>
    : never;
};

type DepNames<Deps extends readonly any[]> =
  IsAny<Deps[number]> extends true ? never
  : Deps[number] extends Driver<infer N> ? N
  : never;

export type DriverHandle<D extends Driver<any, any>> = {
  api: PromisifyApi<D["api"]>;
  state: D["state"];
} & DriverDepMixin<D["deps"]>;

type DriverDepMixin<Deps extends readonly any[]> =
  [DepNames<Deps>] extends [never] ? {}
  : {
      dep: <DN extends DepNames<Deps>>(
        depName: DN,
      ) => DriverHandle<Extract<Deps[number], { name: DN }>>;
    };
