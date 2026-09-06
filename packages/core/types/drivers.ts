import type { Telemetry } from "../index.js";
import type { TypedEventTarget } from "../lib/eventtarget.js";
import type { Sockets, Events as TEvents } from "./index.js";

// This namespace intentionally uses structural driver projections. Importing
// the manager here would create a circular dependency during inference.
export namespace Drivers {
  export interface DriverShape {
    readonly name: string;
    readonly deps: readonly DriverShape[];
    readonly state: Record<string, unknown>;
    readonly api: ApiRecord;
    readonly socket?: Sockets.Socket;
    readonly events?: TypedEventTarget<Record<string, unknown>>;
    readonly tel: Telemetry;
    start(): void | Promise<void>;
    end(): void | Promise<void>;
    on(
      type: "driver:state-updated",
      listener: (event: { data: Partial<Record<string, unknown>> }) => void,
    ): unknown;
    on(
      type: "driver:delimited",
      listener: (event: string | Uint8Array | Buffer) => void,
    ): unknown;
  }

  export type Array = readonly DriverShape[];

  export type PartialArray<T extends readonly unknown[]> =
    | T
    | readonly T[number][];

  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type DriverView = {
    name: string;
    deps: DriverView[];
    socket?: {
      traceName: string;
      canWrite: boolean;
      canReceive: boolean;
    };
  };

  export type AnyDriver = DriverShape;

  export interface ManagerView<N extends Drivers.Array = Drivers.Array> {
    readonly drivers: N;
    readonly drivers_flat: AnyDriver[];
    readonly driver: Catalog<N>;
    readonly plugin: Catalog;
    bus: TypedEventTarget<TEvents.Natav.Map<N>>;
    GetDriver<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.FromName<N, Name>;
    FindDriver(name: string): AnyDriver | undefined;
    GetAllDriverNames(): Drivers.Names<N>[];
    Start(): Promise<void>;
    GetTree(): DriverView[];
    End(): Promise<void>;
  }

  export interface Manager<
    D extends Drivers.Array = Drivers.Array,
    S extends readonly Drivers.AnyDeferred[] = readonly Drivers.AnyDeferred[],
    P extends readonly Drivers.AnyDeferred[] = readonly Drivers.AnyDeferred[],
  > extends ManagerView<Drivers.Merged<D, S>> {
    readonly plugin: Catalog<DeferredInstances<P>>;
  }

  type DeferredFunction<T extends DriverShape = DriverShape> = ((
    manager: any,
  ) => T) & {
    prototype?: undefined;
  };

  type DeferredConstructor<T extends DriverShape = DriverShape> = (new (
    manager: any,
  ) => T) & {
    prototype: object;
  };

  export type AnyDeferred<T extends DriverShape = DriverShape> =
    | DeferredFunction<T>
    | DeferredConstructor<T>;

  type DeferredReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type DeferredInstances<S extends readonly AnyDeferred[]> = {
    [K in keyof S]: DeferredReturn<S[K]>;
  };

  export type Merged<
    D extends Drivers.Array,
    S extends readonly AnyDeferred[],
  > =
    number extends D["length"] ?
      readonly (D[number] | DeferredInstances<S>[number])[]
    : readonly [...D, ...DeferredInstances<S>];

  type PromisifyApi<Obj> = {
    [M in keyof Obj]: Obj[M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : Obj[M] extends readonly any[] ? Obj[M]
    : Obj[M] extends object ? PromisifyApi<Obj[M]>
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
    FromName<N, Name>["events"] extends TypedEventTarget<infer EventMap> ?
      EventMap
    : never;

  export type DriverClosure<D, Seen = never> =
    D extends DriverShape ?
      D extends Seen ?
        never
      : D | DriverClosure<D["deps"][number], Seen | D>
    : never;

  export type Resolved<N extends Drivers.Array = Drivers.Array> = DriverClosure<
    N[number]
  >;

  type NamedDriver<DriverUnion, Name extends string> =
    DriverUnion extends DriverShape ?
      DriverUnion["name"] extends Name ?
        DriverUnion
      : never
    : never;

  export type Names<N extends Drivers.Array = Drivers.Array> =
    Resolved<N>["name"];

  export type FromName<
    N extends Drivers.Array,
    Name extends Names<N> = Names<N>,
  > = NamedDriver<Resolved<N>, Name>;

  export type Catalog<N extends Drivers.Array = Drivers.Array> = {
    [D in Resolved<N> as D["name"]]: D;
  };

  export type DepNames<
    N extends Drivers.Manager,
    Name extends Drivers.Names<N["drivers"]>,
  > = FromName<N["drivers"], Name>["deps"][number]["name"];

  export type TreeNode<D extends DriverShape> = {
    name: D["name"];
    driver: D;
    deps: {
      readonly [K in keyof D["deps"]]: D["deps"][K] extends DriverShape ?
        TreeNode<D["deps"][K]>
      : never;
    };
  };

  export type Tree<N extends Drivers.Array> = {
    readonly [K in keyof N]: N[K] extends DriverShape ? TreeNode<N[K]> : never;
  };

  export type Handle<D extends DriverShape> = {
    deps: D["deps"];
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["events"];
    on: D["on"];
  };
}
