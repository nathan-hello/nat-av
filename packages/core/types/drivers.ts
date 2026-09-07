import type { Telemetry } from "../index.js";
import type { TypedEventTarget } from "../lib/eventtarget.js";
import type { Sockets, Events as TEvents } from "./index.js";

// This namespace intentionally uses structural driver projections. Importing
// the manager here would create a circular dependency during inference.
export namespace Drivers {
  /** The shared structural contract for every managed runtime entry. */
  export interface ManagedContract {
    readonly name: string;
    readonly deps: readonly ManagedContract[];
    readonly state: Record<string, unknown>;
    readonly api: ApiRecord;
    readonly events?: TypedEventTarget<Record<string, unknown>>;
  }

  /** Runtime requirements specific to ordinary driver instances. */
  export interface DriverShape extends ManagedContract {
    readonly deps: readonly DriverShape[];
    readonly socket?: Sockets.Socket;
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

  export type AnyManaged = ManagedContract;

  export type ManagedClosure<Entry, Seen = never> =
    Entry extends ManagedContract ?
      Entry extends Seen ? never
      : Entry | ManagedClosure<Entry["deps"][number], Seen | Entry>
    : never;

  export type ManagedResolved<
    Entries extends readonly ManagedContract[] = readonly ManagedContract[],
  > = ManagedClosure<Entries[number]>;

  export type ManagedCatalog<
    Entries extends readonly ManagedContract[] = readonly ManagedContract[],
  > = {
    [Entry in ManagedResolved<Entries> as Entry["name"]]: Entry;
  };

  export type CatalogEntries<
    Catalog extends Record<string, ManagedContract>,
  > = Catalog[keyof Catalog];

  export interface ManagerView<
    N extends Drivers.Array = Drivers.Array,
    C extends Drivers.Array = N,
  > {
    readonly drivers: N;
    readonly drivers_flat: AnyDriver[];
    readonly driver: Catalog<C>;
    bus: TypedEventTarget<TEvents.Natav.Map<C>>;
    GetDriver<Name extends Drivers.Names<C>>(
      name: Name,
    ): Drivers.FromName<C, Name>;
    FindDriver(name: string): AnyDriver | undefined;
    FindPlugin(name: string): AnyDriver | undefined;
    GetAllDriverNames(): Drivers.Names<N>[];
    Start(): Promise<void>;
    GetTree(): DriverView[];
    End(): Promise<void>;
  }

  export interface Manager<
    D extends Drivers.Array = Drivers.Array,
    P extends readonly Drivers.AnyPlugin[] = readonly Drivers.AnyPlugin[],
  > extends ManagerView<D, DriverEntries<D, P>> {
    readonly plugins: PluginInstances<P>;
    readonly plugin: RootCatalog<PluginInstances<P>>;
    GetAllPluginNames(): Drivers.Names<PluginInstances<P>>[];
    Get<Name extends Drivers.Names<ManagedEntries<D, P>>>(
      name: Name,
    ): Drivers.FromName<ManagedEntries<D, P>, Name>;
    Get(name: string): AnyDriver;
  }

  type PluginFunction<T extends DriverShape = DriverShape> = ((
    manager: any,
  ) => T) & {
    prototype?: undefined;
  };

  type PluginConstructor<T extends DriverShape = DriverShape> = (new (
    manager: any,
  ) => T) & {
    prototype: object;
  };

  export type AnyPlugin<T extends DriverShape = DriverShape> =
    | PluginFunction<T>
    | PluginConstructor<T>;

  type PluginReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type PluginInstances<P extends readonly AnyPlugin[]> = {
    [K in keyof P]: PluginReturn<P[K]>;
  };

  export type PluginDependencies<P extends readonly AnyPlugin[]> = Exclude<
    ManagedResolved<PluginInstances<P>>,
    PluginInstances<P>[number]
  >;

  export type DriverEntries<
    D extends Drivers.Array,
    P extends readonly AnyPlugin[],
  > = readonly [...D, ...PluginDependencies<P>[]];

  export type ManagedEntries<
    D extends Drivers.Array,
    P extends readonly AnyPlugin[],
  > = readonly [...DriverEntries<D, P>, ...PluginInstances<P>];

  export type PromisifyApi<Obj> = {
    [M in keyof Obj]: Obj[M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : Obj[M] extends readonly any[] ? Obj[M]
    : Obj[M] extends object ? PromisifyApi<Obj[M]>
    : Obj[M];
  };

  export type Api<
    N extends readonly ManagedContract[],
    Name extends string,
  > = FromName<N, Name>["api"];

  export type State<
    N extends readonly ManagedContract[] = Drivers.Array,
    Name extends string = ManagedNames<ManagedResolved<N>>,
  > = FromName<N, Name>["state"];

  export type Events<
    N extends readonly ManagedContract[],
    Name extends string,
  > =
    FromName<N, Name>["events"] extends TypedEventTarget<infer EventMap> ?
      EventMap
    : never;

  export type DriverClosure<D, Seen = never> =
    D extends DriverShape ?
      D extends Seen ?
        never
      : D | DriverClosure<D["deps"][number], Seen | D>
    : never;

  export type Resolved<
    N extends readonly ManagedContract[] = Drivers.Array,
  > = ManagedResolved<N>;

  export type ManagedName<Entry> =
    Entry extends { readonly name: infer Name extends string } ? Name : never;

  export type ManagedNames<Catalog> = ManagedName<Catalog>;

  /**
   * Selects a managed contract by name while retaining widened contracts such
   * as Decoder<string> for runtime-created driver arrays.
   */
  export type ManagedByName<Entry, Name extends string> =
    Entry extends ManagedContract ?
      string extends Entry["name"] ? Entry
      : string extends Name ? Entry
      : Name extends Entry["name"] ? Entry
      : never
    : never;

  export type ManagedDepNames<
    Entries extends readonly ManagedContract[],
    Name extends string,
  > = ManagedByName<ManagedResolved<Entries>, Name> extends infer Entry ?
    Entry extends ManagedContract ? Entry["deps"][number]["name"]
    : never
  : never;

  export type Names<
    N extends readonly ManagedContract[] = Drivers.Array,
  > =
    Resolved<N>["name"];

  export type FromName<
    N extends readonly ManagedContract[],
    Name extends string = Names<N>,
  > = ManagedByName<Resolved<N>, Name>;

  export type Catalog<
    N extends readonly ManagedContract[] = readonly ManagedContract[],
  > = ManagedCatalog<N>;

  export type RootCatalog<
    N extends readonly ManagedContract[] = readonly ManagedContract[],
  > = {
    [Entry in N[number] as Entry["name"]]: Entry;
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

  export type ManagedHandle<D extends ManagedContract> = {
    deps: {
      readonly [K in keyof D["deps"]]: D["deps"][K] extends ManagedContract ?
        ManagedHandle<D["deps"][K]>
      : never;
    };
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["events"];
  };

  export type Handle<D extends DriverShape> = ManagedHandle<D> & {
    on: D["on"];
  };
}
