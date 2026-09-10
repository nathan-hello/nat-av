import type { Telemetry } from "../index.js";
import type { TypedEventTarget } from "../lib/eventtarget.js";
import type { Sockets, Events as TEvents } from "./index.js";

// This namespace intentionally uses structural driver projections. Importing
// the manager here would create a circular dependency during inference.
export namespace Natav {
  export interface Shape {
    readonly scope: "driver" | "plugin";
    readonly name: string;
    readonly deps: readonly Shape[];
    readonly state: Record<string, unknown>;
    readonly api: ApiRecord;
    readonly events?: TypedEventTarget<Record<string, unknown>>;
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

  export type Array = readonly Shape[];

  export type GroupInput<T extends Shape = Shape> =
    readonly T[] | { readonly [name: string]: GroupInput<T> };

  export type RootInput<T extends Shape = Shape> = readonly (
    T | GroupInput<T>
  )[];

  export type PluginGroupInput<T extends AnyPlugin = AnyPlugin> =
    readonly T[] | { readonly [name: string]: PluginGroupInput<T> };

  export type PluginInput<T extends AnyPlugin = AnyPlugin> = readonly (
    T | PluginGroupInput<T>
  )[];

  export type PluginGroupPaths<Input> =
    Input extends AnyPlugin ? never
    : Input extends readonly unknown[] ? PluginGroupPaths<Input[number]>
    : Input extends Record<string, unknown> ?
      string extends keyof Input ?
        `/${string}`
      : {
          [Name in keyof Input & string]: Input[Name] extends (
            readonly AnyPlugin[]
          ) ?
            `/${Name}`
          : Input[Name] extends Record<string, unknown> ?
            `/${Name}` | `/${Name}${PluginGroupPaths<Input[Name]>}`
          : never;
        }[keyof Input & string]
    : never;

  export type GroupPaths<Input, Depth extends readonly unknown[] = []> =
    Depth["length"] extends 16 ? `/${string}`
    : Input extends readonly unknown[] ?
      GroupPaths<Input[number], [...Depth, 0]>
    : Input extends Shape ? never
    : Input extends Record<string, unknown> ?
      string extends keyof Input ?
        `/${string}`
      : {
          [Name in keyof Input & string]: Input[Name] extends readonly Shape[] ?
            `/${Name}`
          : Input[Name] extends Record<string, unknown> ?
            `/${Name}` | `/${Name}${GroupPaths<Input[Name], [...Depth, 0]>}`
          : never;
        }[keyof Input & string]
    : never;

  export type RootDrivers<Input extends RootInput> = InputDrivers<Input>[];

  export type InputDrivers<Input, Depth extends readonly unknown[] = []> =
    Depth["length"] extends 16 ? Shape
    : Input extends Shape ? Input
    : Input extends readonly unknown[] ?
      InputDrivers<Input[number], [...Depth, 0]>
    : Input extends Record<string, unknown> ?
      InputDrivers<Input[keyof Input], [...Depth, 0]>
    : never;

  export type PartialArray<T extends readonly unknown[]> =
    T | readonly T[number][];

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

  export type ManagedClosure<Entry, Seen = never> =
    Entry extends Shape ?
      Entry extends Seen ?
        never
      : Entry | ManagedClosure<Entry["deps"][number], Seen | Entry>
    : never;

  export type ManagedResolved<
    Entries extends readonly Shape[] = readonly Shape[],
  > = ManagedClosure<Entries[number]>;

  export type ManagedCatalog<
    Entries extends readonly Shape[] = readonly Shape[],
  > = {
    [Entry in ManagedResolved<Entries> as Entry["name"]]: Entry;
  };

  export type CatalogEntries<Catalog extends Record<string, Shape>> =
    Catalog[keyof Catalog];

  export interface ManagerView<
    N extends Natav.Array = Natav.Array,
    C extends Natav.Array = N,
  > {
    readonly drivers: N;
    readonly drivers_flat: Shape[];
    readonly driver: Catalog<C>;
    readonly groups: ReadonlyMap<string, readonly Shape[]>;
    bus: TypedEventTarget<TEvents.Natav.Map<C>>;
    GetDriver<Name extends Natav.Names<C>>(name: Name): Natav.FromName<C, Name>;
    FindDriver(name: string): Shape | undefined;
    FindPlugin(name: string): Shape | undefined;
    FindGroup(path: string): readonly Shape[] | undefined;
    GetAllGroupPaths(): string[];
    AddDriver(
      driver: Shape,
      groupPath?: readonly string[],
    ): void | Promise<void>;
    RemoveDriver(name: string): void | Promise<void>;
    GetAllDriverNames(): Natav.Names<N>[];
    Start(): Promise<void>;
    GetTree(): DriverView[];
    End(): Promise<void>;
  }

  export interface Instance<
    D extends Natav.RootInput = Natav.Array,
    P extends readonly Natav.AnyPlugin[] = readonly Natav.AnyPlugin[],
  > extends ManagerView<RootDrivers<D>, DriverEntries<D, P>> {
    readonly plugins: PluginInstances<P>;
    readonly plugin: RootCatalog<PluginInstances<P>>;
    GetAllPluginNames(): Natav.Names<PluginInstances<P>>[];
    Get<Name extends Natav.Names<ManagedEntries<D, P>>>(
      name: Name,
    ): Natav.FromName<ManagedEntries<D, P>, Name>;
    Get(name: string): Shape;
  }

  type PluginFunction<T extends Shape = Shape> = ((manager: any) => T) & {
    prototype?: undefined;
  };

  type PluginConstructor<T extends Shape = Shape> = (new (
    manager: any,
  ) => T) & {
    prototype: object;
  };

  export type AnyPlugin<T extends Shape = Shape> =
    PluginFunction<T> | PluginConstructor<T>;

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
    D extends Natav.RootInput,
    P extends readonly AnyPlugin[],
  > = readonly (InputDrivers<D> | PluginDependencies<P>)[];

  export type ManagedEntries<
    D extends Natav.RootInput,
    P extends readonly AnyPlugin[],
  > = readonly (DriverEntries<D, P>[number] | PluginInstances<P>[number])[];

  export type PromisifyApi<Obj> = {
    [M in keyof Obj]: Obj[M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : Obj[M] extends readonly any[] ? Obj[M]
    : Obj[M] extends object ? PromisifyApi<Obj[M]>
    : Obj[M];
  };

  export type Api<N extends readonly Shape[], Name extends string> = FromName<
    N,
    Name
  >["api"];

  export type State<
    N extends readonly Shape[] = Natav.Array,
    Name extends string = ManagedNames<ManagedResolved<N>>,
  > = FromName<N, Name>["state"];

  export type Events<N extends readonly Shape[], Name extends string> =
    FromName<N, Name>["events"] extends TypedEventTarget<infer EventMap> ?
      EventMap
    : never;

  export type DriverClosure<D, Seen = never> =
    D extends Shape ?
      D extends Seen ?
        never
      : D | DriverClosure<D["deps"][number], Seen | D>
    : never;

  export type Resolved<N extends readonly Shape[] = Natav.Array> =
    ManagedResolved<N>;

  export type ManagedName<Entry> =
    Entry extends { readonly name: infer Name extends string } ? Name : never;

  export type ManagedNames<Catalog> = ManagedName<Catalog>;

  /**
   * Selects a managed contract by name while retaining widened contracts such
   * as Decoder<string> for runtime-created driver arrays.
   */
  export type ManagedByName<Entry, Name extends string> =
    Entry extends Shape ?
      string extends Entry["name"] ? Entry
      : string extends Name ? Entry
      : Name extends Entry["name"] ? Entry
      : never
    : never;

  export type ManagedDepNames<
    Entries extends readonly Shape[],
    Name extends string,
  > =
    ManagedByName<ManagedResolved<Entries>, Name> extends infer Entry ?
      Entry extends Shape ?
        Entry["deps"][number]["name"]
      : never
    : never;

  export type Names<N extends readonly Shape[] = Natav.Array> =
    Resolved<N>["name"];

  export type FromName<
    N extends readonly Shape[],
    Name extends string = Names<N>,
  > = ManagedByName<Resolved<N>, Name>;

  export type Catalog<N extends readonly Shape[] = readonly Shape[]> =
    ManagedCatalog<N>;

  export type RootCatalog<N extends readonly Shape[] = readonly Shape[]> = {
    [Entry in N[number] as Entry["name"]]: Entry;
  };

  export type DepNames<
    N extends Instance,
    Name extends Natav.Names<N["drivers"]>,
  > = FromName<N["drivers"], Name>["deps"][number]["name"];

  export type TreeNode<D extends Shape> = {
    name: D["name"];
    driver: D;
    deps: {
      readonly [K in keyof D["deps"]]: D["deps"][K] extends Shape ?
        TreeNode<D["deps"][K]>
      : never;
    };
  };

  export type Tree<N extends Natav.Array> = {
    readonly [K in keyof N]: N[K] extends Shape ? TreeNode<N[K]> : never;
  };

  export type ManagedHandle<D extends Shape> = {
    deps: {
      readonly [K in keyof D["deps"]]: D["deps"][K] extends Shape ?
        ManagedHandle<D["deps"][K]>
      : never;
    };
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["events"];
  };

  export type Handle<D extends Shape> = ManagedHandle<D> & {
    on: D["on"];
  };
}
