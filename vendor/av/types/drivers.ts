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

  export type ManagerParams<M extends Drivers.Manager> =
    M extends Drivers.Manager<infer A, infer B, infer C> ? [A, B, C] : never;

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
  > = FromName<N, Name>["api"];

  export type State<
    N extends Drivers.Array = Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = FromName<N, Name>["state"];

  export type Events<N extends Drivers.Array, Name extends Drivers.Names<N>> =
    FromName<N, Name>["events"] extends TypedEventTarget<infer Events> ? Events
    : never;

  type DriverTypeDepthLimit = readonly [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  type ShiftDepth<Depth extends readonly unknown[]> =
    Depth extends readonly [unknown, ...infer Rest] ? Rest : readonly [];

  type FlattenedMembers<
    D extends Driver,
    Depth extends readonly unknown[],
  > = Drivers.WithDeps<D, Depth>[number];

  export type WithDeps<
    D extends Driver | Drivers.Array,
    Depth extends readonly unknown[] = DriverTypeDepthLimit,
  > =
    D extends Driver ?
      readonly [
        D,
        ...(Depth extends readonly [] ? readonly []
        : number extends NonNullable<D["deps"]>["length"] ? readonly []
        : Drivers.WithDeps<NonNullable<D["deps"]>, ShiftDepth<Depth>>),
      ]
    : D extends readonly [] ? readonly []
    : D extends (
      readonly [infer Head extends Driver, ...infer Rest extends Drivers.Array]
    ) ?
      readonly [
        ...Drivers.WithDeps<Head, Depth>,
        ...Drivers.WithDeps<Rest, Depth>,
      ]
    : D extends readonly (infer Item extends Driver)[] ?
      readonly FlattenedMembers<Item, Depth>[]
    : readonly [];

  export type Resolved<N extends Drivers.Array = Drivers.Array> = Extract<
    Drivers.WithDeps<N>[number],
    Driver
  >;

  type NamedDriver<DriverUnion, Name extends string> =
    DriverUnion extends Driver ?
      DriverUnion["name"] extends Name ?
        DriverUnion
      : never
    : never;

  export type Names<N extends Drivers.Array = Drivers.Array> =
    Drivers.Resolved<N>["name"];

  export type FromName<
    N extends Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = NamedDriver<Drivers.Resolved<N>, Name>;

  export type DepNames<
    N extends Drivers.Manager,
    Name extends Drivers.Names<N["configs"]>,
  > = NonNullable<Drivers.FromName<N["configs"], Name>["deps"]>[number]["name"];

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
