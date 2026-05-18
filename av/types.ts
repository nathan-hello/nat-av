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
  ): () => void;
  name: string;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

type DepMapOf<D extends Driver> = D["deps"];

type DepUnion<Deps> =
  IsAny<Deps> extends true ? never
  : Deps extends Record<string, infer Dep> ? Dep
  : never;

type DriverTree<D> =
  D extends Driver ? D | DriverTree<Extract<DepUnion<DepMapOf<D>>, Driver>> : never;

type DriversOf<C extends readonly Driver[]> = DriverTree<C[number]>;

export type NamesOf<C extends readonly Driver[]> = DriversOf<C>["name"];

export type DriverFor<C extends readonly Driver[], N extends NamesOf<C>> = Extract<
  DriversOf<C>,
  { name: N }
>;

export type StateFor<C extends readonly Driver[], N extends NamesOf<C>> = DriverFor<C, N>["state"];

export type ApiFor<C extends readonly Driver[], N extends NamesOf<C>> = {
  [M in keyof DriverFor<C, N>["api"]]: DriverFor<C, N>["api"][M] extends (
    (...args: infer Args) => infer R
  ) ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

export type DepsOf<C extends readonly Driver[], N extends NamesOf<C>> = DriverFor<C, N>["deps"];

export type DepNamesOf<C extends readonly Driver[], N extends NamesOf<C>> =
  IsAny<DepsOf<C, N>> extends true ? never : keyof DepsOf<C, N> & string;

export type DepFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
  DN extends DepNamesOf<C, N>,
> = Extract<DepsOf<C, N>[DN], Driver>;

type PromisifyApi<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer Args) => infer R ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type DepNames<Deps> = IsAny<Deps> extends true ? never : keyof Deps & string;

export type DriverHandle<D extends Driver<any, any>> = {
  api: PromisifyApi<D["api"]>;
  state: D["state"];
} & DriverDepMixin<D["deps"]>;

type DriverDepMixin<Deps> =
  [DepNames<Deps>] extends [never] ? {}
  : {
      dep: <DN extends DepNames<Deps>>(depName: DN) => DriverHandle<Extract<Deps[DN], Driver>>;
    };
