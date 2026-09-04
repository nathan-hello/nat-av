import type { Driver } from "@nat-av/core/drivers";
import type { TypedEventTarget } from "@nat-av/core/lib/eventtarget";
import type { Sockets, Events as TEvents } from "@nat-av/core/types";
import type { Rpc } from "@nat-av/core/rpc/types";

// This namespace is not allowed to import Natav namespace.
// The Natav namespace uses Driver for inference, so trying
// to get the Natav.Names<N> for example will cause a circular
// dependency that Typescript cannot resolve.
export namespace Drivers {

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

  export interface ManagerView<N extends Drivers.Array = Drivers.Array> {
    readonly drivers: N;
    readonly drivers_flat: Driver[];
    bus: TypedEventTarget<TEvents.Natav.Map<N>>;
    GetDriver<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.FromName<N, Name>;
    FindDriver(name: string): Driver | undefined;
    GetAllDriverNames(): Drivers.Names<N>[];
    Start(): Promise<void>;
    GetTree(): DriverView[];
    End(): Promise<void>;
  }

  export interface Manager<
    D extends Drivers.Array = Drivers.Array,
    S extends readonly Drivers.AnyDeferred[] = readonly Drivers.AnyDeferred[],
  > extends ManagerView<Drivers.Merged<D, S>> {}

  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type AnyDriver = Driver<
    string,
    Drivers.Array,
    ApiRecord,
    Record<string, any>,
    TypedEventTarget<{ [x: string]: Rpc.Json.Value }> | undefined,
    Partial<Sockets.Socket> | undefined
  >;

  export type Merged<
    D extends Drivers.Array,
    S extends readonly Drivers.AnyDeferred[],
  > =
    number extends D["length"] ?
      readonly (D[number] | Drivers.DeferredInstances<S>[number])[]
    : readonly [...D, ...Drivers.DeferredInstances<S>];

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

  type DeferredReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type DeferredInstances<S extends readonly Drivers.AnyDeferred[]> = {
    [K in keyof S]: DeferredReturn<S[K]>;
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
      readonly Drivers.WithDeps<Item, Depth>[number][]
    : readonly [];

  export type Resolved<N extends Drivers.Array = Drivers.Array> =
    Drivers.WithDeps<N>[number];

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
    Name extends Drivers.Names<N["drivers"]>,
  > = NonNullable<Drivers.FromName<N["drivers"], Name>["deps"]>[number]["name"];

  export type Handle<D extends Driver> = {
    deps: D["deps"];
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["state"];
    on: D["on"];
  };
}
