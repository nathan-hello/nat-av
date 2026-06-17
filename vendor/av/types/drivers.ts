import type { Driver } from "@av/drivers";
import type { TypedEventTarget } from "@av/lib/eventtarget";
import type { Rpc, Sockets, Events as TEvents } from "@av/types";

// This namespace is not allowed to import Natav namespace.
// The Natav namespace uses Driver for inference, so trying
// to get the Natav.Names<N> for example will cause a circular
// dependency that Typescript cannot resolve.
export namespace Drivers {
  export type Context<ClientId extends string = string> =
    Rpc.Server.Context<ClientId>;

  export type Array = readonly Drivers.AnyDriver[];

  export type PartialArray<T extends readonly unknown[]> =
    | T
    | readonly T[number][];

  export type DriverView = {
    name: string;
    deps: DriverView[];
    socket?: {
      traceName: string;
      canWrite: boolean;
      canReceive: boolean;
    };
  };

  export interface ManagerView<
    N extends Drivers.Array = Drivers.Array,
    Context extends Drivers.Context = Drivers.Context,
  > {
    readonly configs: N;
    bus: TypedEventTarget<TEvents.Natav.Map<N>>;
    GetDriver<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.FromName<N, Name>;
    GetDriverState<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.State<N, Name>;
    FindDriver(name: string): Driver | undefined;
    GetAllDriverNames(): Drivers.Names<N>[];
    Start(): Promise<void>;
    GetTree(): DriverView[];
    End(): Promise<void>;
    runWithContext<T>(context: Context, fn: () => T): T;
    GetContext(): Context;
  }

  export interface Manager<
    D extends Drivers.Array = Drivers.Array,
    S extends readonly Drivers.AnyDeferred[] = readonly Drivers.AnyDeferred[],
    Context extends Drivers.Context = Drivers.Context,
  > extends ManagerView<Drivers.Merged<D, S>, Context> {}

  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type AnyDriver = Driver<
    string,
    Drivers.Array,
    ApiRecord,
    Record<string, any>,
    TypedEventTarget<{ [x: string]: Rpc.Json.Value }> | undefined,
    Partial<Sockets.Client> | undefined
  >;

  export type Merged<
    D extends Drivers.Array,
    S extends readonly Drivers.AnyDeferred[],
  > =
    number extends D["length"] ?
      readonly (D[number] | Drivers.DeferredInstances<S>[number])[]
    : readonly [...D, ...Drivers.DeferredInstances<S>];

  export type Deferred<
    N extends Drivers.Array = Drivers.Array,
    T extends Driver = Driver,
    Context extends Drivers.Context = Drivers.Context,
  > =
    | ((
        natav: Drivers.Manager<N, readonly Drivers.AnyDeferred[], Context>,
      ) => T)
    | (new (
        natav: Drivers.Manager<N, readonly Drivers.AnyDeferred[], Context>,
      ) => T);

  type DeferredFunction<T extends Driver = Driver> = ((natav: any) => T) & {
    prototype?: undefined;
  };

  type DeferredConstructor<T extends Driver = Driver> = (new (
    natav: any,
  ) => T) & {
    prototype: object;
  };

  export type AnyDeferred<T extends Driver = Driver> =
    | DeferredFunction<T>
    | DeferredConstructor<T>;

  export type DeferredReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type DeferredInstances<S extends readonly Drivers.AnyDeferred[]> = {
    [K in keyof S]: Drivers.DeferredReturn<S[K]>;
  };

  type PromisifyApi<Obj> = {
    [M in keyof Obj]: Obj[M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : Obj[M] extends readonly any[] ? Obj[M]
    : Obj[M] extends object ? PromisifyApi<Obj>[M]
    : Obj[M];
  };

  export type Api<
    N extends Drivers.Array,
    Name extends Drivers.Names<N>,
  > = FromName<N, Name> extends { api: infer Api extends Drivers.ApiRecord } ? Api
    : never;

  export type State<
    N extends Drivers.Array = Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = FromName<N, Name> extends { state: infer State extends Record<string, any> } ?
    State
  : never;

  export type Events<N extends Drivers.Array, Name extends Drivers.Names<N>> =
    FromName<N, Name> extends { events: TypedEventTarget<infer Events> } ? Events
    : never;

  type IsTuple<T extends readonly unknown[]> =
    number extends T["length"] ? false : true;

  type IsAny<T> = 0 extends (1 & T) ? true : false;

  export type WithDeps<D extends Driver | Drivers.Array> =
    IsAny<D> extends true ? readonly []
    : D extends Driver ?
      IsAny<NonNullable<D["deps"]>> extends true ? readonly [D]
      : NonNullable<D["deps"]> extends Drivers.Array ?
        IsTuple<NonNullable<D["deps"]>> extends true ?
          readonly [D, ...WithDeps<NonNullable<D["deps"]>>]
        : readonly [D]
      : readonly [D]
    : D extends readonly [] ? readonly []
    : D extends (
      readonly [infer Head extends Driver, ...infer Rest extends Drivers.Array]
    ) ?
      readonly [...WithDeps<Head>, ...WithDeps<Rest>]
    : D extends readonly (infer Item extends Driver)[] ?
      readonly [Item]
    : readonly [];

  export type Names<N extends Drivers.Array = Drivers.Array> =
    Drivers.WithDeps<N>[number]["name"];

  export type FromName<
    N extends Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = Extract<Drivers.WithDeps<N>[number], { name: Name }>;

  export type Handle<D extends Driver> = {
    deps: D["deps"];
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["state"];
    on: D["on"];
  };

  export type DepsOf<D extends Driver> = NonNullable<D["deps"]>[number];
}
