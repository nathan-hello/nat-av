import { Err } from "../lib/errors.js";
import { Convert } from "../lib/convert.js";
import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "../lib/eventtarget.js";
import { Telemetry } from "../telemetry/index.js";
import {
  type Natav as NatavTypes,
  type Events,
  type Sockets,
} from "../types/index.js";

type EventsMaybe = TypedEventTarget<any> | undefined;
type SocketMaybe = Sockets.Socket | undefined;

abstract class DriverBase<
  Name extends string = string,
  State extends Record<string, unknown> = Record<string, unknown>,
  Deps extends readonly NatavTypes.Shape[] = readonly [],
> extends ProtectedTypedEventTarget<Events.Driver.Map<State>> {
  public abstract state: State;
  public abstract api: NatavTypes.ApiRecord;

  public socket: SocketMaybe = undefined;
  public events: EventsMaybe = undefined;
  public name: Name;
  public deps: Deps;
  public tel: Telemetry;

  constructor({ name, deps }: { name: Name; deps?: Deps }) {
    super();
    // TSAS: An omitted dependency list is represented by the default empty tuple.
    this.deps = deps ?? ([] as unknown as Deps);
    this.name = name;
    this.tel = new Telemetry(`Driver::${this.name}`);
  }

  protected dispatch<K extends keyof Events.Driver.Map<State>>(
    type: K,
    payload: Events.Driver.Map<State>[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type, payload });
  }

  public start(): Promise<void> | void {
    this.socket?.start?.();
  }
  public end(): Promise<void> | void {
    this.socket?.end?.();
  }

  public dep<K extends Deps[number]["name"]>(
    name: K,
  ): Extract<Deps[number], { name: K }> {
    const child = this.deps?.find(
      (d): d is Extract<Deps[number], { name: K }> => d.name === name,
    );

    if (!child) {
      throw new Error(`Driver.dep: ${name}`, {
        cause: Err.Codes.DriverNotFound,
      });
    }

    return child;
  }
}

export class Natav<
  const D extends NatavTypes.RootInput = NatavTypes.Array,
  const P extends readonly NatavTypes.AnyPlugin[] =
    readonly NatavTypes.AnyPlugin[],
> {
  readonly input: D;
  readonly drivers: NatavTypes.RootDrivers<D>;
  readonly plugins: NatavTypes.PluginInstances<P>;
  readonly drivers_flat: NatavTypes.Shape[] = [];
  readonly driver: NatavTypes.Catalog<NatavTypes.DriverEntries<D, P>>;
  readonly plugin: NatavTypes.RootCatalog<NatavTypes.PluginInstances<P>>;
  private readonly groupMembers = new Map<string, NatavTypes.Shape[]>();
  private readonly runtimeRoots: NatavTypes.Shape[] = [];
  private readonly startedEntries = new Set<NatavTypes.Shape>();
  private started = false;
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<NatavTypes.DriverEntries<D, P>>
  >();

  get groups(): ReadonlyMap<string, readonly NatavTypes.Shape[]> {
    return this.groupMembers;
  }

  constructor(args: {
    drivers?: D | NatavTypes.RootInput;
    plugin?: P | NatavTypes.PluginInput;
  }) {
    // TSAS: The empty default is replaced by the inferred driver tuple when no drivers are supplied.
    const configs = args.drivers ?? [];

    const plugins: NatavTypes.Shape[] = [];
    this.readPluginInput(args.plugin ?? [], plugins, (plugin) =>
      "prototype" in plugin && typeof plugin.prototype === "object" ?
        new plugin(this)
      : plugin(this),
    );

    const collect = (
      driver: NatavTypes.Shape,
      seen = new Set<NatavTypes.Shape>(),
    ): NatavTypes.Shape[] => {
      if (seen.has(driver)) return [];
      seen.add(driver);
      const out: NatavTypes.Shape[] = [driver];
      for (const dep of driver.deps ?? []) {
        out.push(...collect(dep, seen));
      }
      return out;
    };

    const driverRoots: NatavTypes.Shape[] = [];
    this.readDriverInput(configs, driverRoots, collect);
    // TSAS: The runtime normalizer extracts direct driver roots from recursive input.
    this.input = configs as D;
    this.drivers = driverRoots as NatavTypes.RootDrivers<D>;
    // TSAS: Each plugin constructor returns the corresponding tuple entry.
    this.plugins = plugins as unknown as Natav.PluginInstances<P>;
    const flat = driverRoots.flatMap((driver) => collect(driver));
    this.runtimeRoots.push(...driverRoots);
    for (const plugin of plugins) {
      for (const dep of plugin.deps) {
        flat.push(...collect(dep));
      }
    }
    const byName = new Map<string, NatavTypes.Shape>();
    for (const driver of flat) {
      if (driver.name.startsWith("/")) {
        throw new Error(
          `Natav managed names cannot start with '/': ${driver.name}`,
        );
      }
      const existing = byName.get(driver.name);
      if (existing && existing !== driver) {
        throw new Error(
          `Natav found multiple drivers of the same name: ${driver.name}`,
          {
            cause: Err.Codes.ManagerFoundMultipleNames,
          },
        );
      }
      byName.set(driver.name, driver);
    }
    this.drivers_flat = [...byName.values()];

    const drivers = Object.fromEntries(
      this.drivers_flat.map((driver) => [driver.name, driver]),
    );
    // TSAS: The runtime catalog is populated from every collected managed entry.
    this.driver = drivers as Natav.Catalog<Natav.DriverEntries<D, P>>;

    const pluginByName = new Map<string, NatavTypes.Shape>();
    for (const plugin of plugins) {
      if (plugin.name.startsWith("/")) {
        throw new Error(
          `Natav managed names cannot start with '/': ${plugin.name}`,
        );
      }
      const driver = byName.get(plugin.name);
      if (driver && driver !== plugin) {
        throw new Error(
          `Natav found multiple managed entries of the same name: ${plugin.name}`,
          { cause: Err.Codes.ManagerFoundMultipleNames },
        );
      }
      if (
        pluginByName.has(plugin.name) &&
        pluginByName.get(plugin.name) !== plugin
      ) {
        throw new Error(
          `Natav found multiple plugins of the same name: ${plugin.name}`,
        );
      }
      pluginByName.set(plugin.name, plugin);
    }
    // TSAS: Plugin constructors are checked by P and the map is keyed by each plugin name.
    this.plugin = Object.fromEntries(pluginByName) as Natav.RootCatalog<
      Natav.PluginInstances<P>
    >;
  }

  private readDriverInput(
    input: NatavTypes.RootInput,
    roots: NatavTypes.Shape[],
    collect: (
      driver: NatavTypes.Shape,
      seen?: Set<NatavTypes.Shape>,
    ) => NatavTypes.Shape[],
    prefix = "",
  ) {
    for (const entry of input) {
      if (this.isShape(entry)) {
        roots.push(entry);
      } else {
        this.readGroup(entry, prefix, roots, collect);
      }
    }
  }

  private readGroup(
    input: NatavTypes.GroupInput,
    prefix: string,
    roots: NatavTypes.Shape[],
    collect: (
      driver: NatavTypes.Shape,
      seen?: Set<NatavTypes.Shape>,
    ) => NatavTypes.Shape[],
  ) {
    if (Array.isArray(input)) {
      if (!prefix) throw new Error("Natav groups must have a name");
      const members = input.map((driver) => {
        roots.push(driver);
        collect(driver);
        return driver;
      });
      this.groupMembers.set(prefix, members);
      this.rebuildParentGroups(prefix);
      return;
    }
    for (const [name, child] of Object.entries(input)) {
      if (name.includes("/")) {
        throw new Error(`Natav group names cannot contain '/': ${name}`);
      }
      this.readGroup(
        child,
        prefix ? `${prefix}/${name}` : `/${name}`,
        roots,
        collect,
      );
    }
  }

  private readPluginInput(
    input: NatavTypes.PluginInput,
    plugins: NatavTypes.Shape[],
    construct: (plugin: NatavTypes.AnyPlugin) => NatavTypes.Shape,
    prefix = "",
  ) {
    for (const entry of input) {
      if (typeof entry === "function") {
        const plugin = construct(entry);
        plugins.push(plugin);
        if (prefix) {
          const members = this.groupMembers.get(prefix) ?? [];
          members.push(plugin);
          this.groupMembers.set(prefix, members);
          this.rebuildParentGroups(prefix);
        }
      } else if (Array.isArray(entry)) {
        this.readPluginInput(entry, plugins, construct, prefix);
      } else {
        for (const [name, child] of Object.entries(entry)) {
          if (name.includes("/")) {
            throw new Error(`Natav group names cannot contain '/': ${name}`);
          }
          this.readPluginInput(
            child,
            plugins,
            construct,
            prefix ? `${prefix}/${name}` : `/${name}`,
          );
        }
      }
    }
  }

  private rebuildParentGroups(path: string) {
    const parts = path.split("/");
    for (let length = parts.length - 1; length > 1; length--) {
      const parent = parts.slice(0, length).join("/");
      const members = [...this.groupMembers.entries()]
        .filter(([child]) => child.startsWith(`${parent}/`))
        .flatMap(([, values]) => values);
      this.groupMembers.set(parent, [
        ...new Map(members.map((driver) => [driver.name, driver])).values(),
      ]);
    }
  }

  private isShape(value: unknown): value is NatavTypes.Shape {
    return (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "deps" in value &&
      "start" in value &&
      "end" in value
    );
  }

  GetDriver<N extends Natav.Names<Natav.DriverEntries<D, P>>>(
    name: N,
  ): Natav.FromName<Natav.DriverEntries<D, P>, N> {
    const found = this.FindDriverTyped(name);
    if (!found) {
      throw new Error(`Natav.GetDriver: ${name}`, {
        cause: Err.Codes.DriverCallFailed,
      });
    }

    return found;
  }

  Get(name: string): NatavTypes.Shape;
  Get<N extends Natav.Names<Natav.ManagedEntries<D, P>>>(
    name: N,
  ): Natav.FromName<Natav.ManagedEntries<D, P>, N>;
  Get(name: string): NatavTypes.Shape {
    const found = this.FindDriver(name) ?? this.FindPlugin(name);
    if (!found) {
      throw new Error(`Natav.Get: ${name}`, {
        cause: Err.Codes.DriverCallFailed,
      });
    }

    // TSAS: The name lookup checks both catalogs before returning the matching entry.
    return found;
  }

  FindDriver(name: string): NatavTypes.Shape | undefined {
    return this.drivers_flat.find((d) => d.name === name);
  }

  FindPlugin(name: string): NatavTypes.Shape | undefined {
    return this.plugins.find((plugin) => plugin.name === name);
  }

  FindGroup(path: string): readonly NatavTypes.Shape[] | undefined {
    return this.groupMembers.get(path);
  }

  GetAllGroupPaths(): Natav.GroupPaths<D>[] {
    return [...this.groupMembers.keys()].sort((left, right) => {
      const depth = (path: string) => path.split("/").length;
      return depth(right) - depth(left) || left.localeCompare(right);
      // TSAS: Runtime group keys are narrowed to the recursive constructor input for static callers.
    }) as Natav.GroupPaths<D>[];
  }

  async AddDriver(
    driver: NatavTypes.Shape,
    groups: readonly string[] = [],
  ): Promise<void> {
    if (driver.name.startsWith("/")) {
      throw new Error(`Natav managed names cannot start with '/': ${driver.name}`);
    }
    if (this.IsManagedName(driver.name)) {
      throw new Error(`Natav found multiple managed entries: ${driver.name}`, {
        cause: Err.Codes.ManagerFoundMultipleNames,
      });
    }
    const entries = this.collectRuntime(driver);
    const pending = new Map<string, NatavTypes.Shape>();
    for (const entry of entries) {
      const previous = pending.get(entry.name);
      if (
        entry.name.startsWith("/") ||
        this.IsManagedName(entry.name) ||
        (previous && previous !== entry)
      ) {
        throw new Error(`Natav found multiple managed entries: ${entry.name}`, {
          cause: Err.Codes.ManagerFoundMultipleNames,
        });
      }
      pending.set(entry.name, entry);
    }
    const groupPath = groups.length > 0 ? `/${groups.join("/")}` : "";
    if (groups.some((segment) => !segment || segment.includes("/"))) {
      throw new Error("Natav runtime group segments must be non-empty and cannot contain '/'");
    }
    this.runtimeRoots.push(driver);
    for (const entry of entries) {
      this.drivers_flat.push(entry);
      // TSAS: The runtime catalog intentionally accepts names unknown to the static Natav generic.
      (this.driver as Record<string, NatavTypes.Shape>)[entry.name] = entry;
    }
    if (groupPath) {
      const members = this.groupMembers.get(groupPath) ?? [];
      members.push(driver);
      this.groupMembers.set(groupPath, members);
      this.rebuildParentGroups(groupPath);
    }
    if (this.started) {
      await this.startEntryTree(driver);
    }
  }

  async RemoveDriver(name: string): Promise<void> {
    const driver = this.FindDriver(name);
    if (!driver) return;
    const index = this.runtimeRoots.indexOf(driver);
    if (index < 0) {
      throw new Error(`Natav cannot remove dependency-only driver: ${name}`);
    }
    this.runtimeRoots.splice(index, 1);
    for (const [path, members] of this.groupMembers) {
      const next = members.filter((member) => member !== driver);
      this.groupMembers.set(path, next);
    }
    const retained = new Set(
      this.runtimeRoots.flatMap((root) => this.collectRuntime(root)),
    );
    for (const entry of [...this.drivers_flat]) {
      if (!retained.has(entry)) {
        if (this.startedEntries.has(entry)) {
          await entry.end();
          this.startedEntries.delete(entry);
        }
        this.drivers_flat.splice(this.drivers_flat.indexOf(entry), 1);
        // TSAS: This deletion mirrors the runtime catalog mutation above.
        delete (this.driver as Record<string, NatavTypes.Shape>)[entry.name];
      }
    }
  }

  private collectRuntime(
    driver: NatavTypes.Shape,
    seen = new Set<NatavTypes.Shape>(),
  ): NatavTypes.Shape[] {
    if (seen.has(driver)) return [];
    seen.add(driver);
    return [
      driver,
      ...driver.deps.flatMap((dep) => this.collectRuntime(dep, seen)),
    ];
  }

  private FindDriverTyped<N extends Natav.Names<Natav.DriverEntries<D, P>>>(
    name: N,
  ): Natav.FromName<Natav.DriverEntries<D, P>, N> | undefined {
    return this.drivers_flat.find(
      (d): d is Natav.FromName<Natav.DriverEntries<D, P>, N> => d.name === name,
    );
  }

  private IsDriverName(
    name: string,
  ): name is Natav.Names<Natav.DriverEntries<D, P>> {
    return this.drivers_flat.some((driver) => driver.name === name);
  }

  private IsManagedName(name: string): boolean {
    return (
      this.IsDriverName(name) ||
      this.plugins.some((plugin) => plugin.name === name)
    );
  }

  GetAllDriverNames(): Natav.Names<Natav.DriverEntries<D, P>>[] {
    return this.drivers_flat
      .map((d) => d.name)
      .filter((name): name is Natav.Names<Natav.DriverEntries<D, P>> =>
        this.IsDriverName(name),
      );
  }

  GetAllPluginNames(): Natav.Names<Natav.PluginInstances<P>>[] {
    // TSAS: Plugin roots came from the constructor tuple and retain its name union.
    return this.plugins.map((plugin) => plugin.name) as Natav.Names<
      Natav.PluginInstances<P>
    >[];
  }

  GetTree(): Natav.DriverView[] {
    const toNode = (driver: NatavTypes.Shape): Natav.DriverView => {
      const socket = driver.socket;
      const canWrite =
        socket !== undefined &&
        "write" in socket &&
        typeof socket.write === "function";
      const canReceive = typeof socket?.on === "function";

      return {
        name: driver.name,
        deps: driver.deps.map((child) => toNode(child)),
        ...(typeof socket?.name === "string" ?
          {
            socket: {
              traceName: socket.name,
              canWrite,
              canReceive,
            },
          }
        : {}),
      };
    };

    const raw = this.runtimeRoots.map((driver) => toNode(driver));

    // Dedupe: keep each driver only at its deepest occurrence.
    const maxDepth = new Map<string, number>();
    const measure = (node: Natav.DriverView, depth: number) => {
      const prev = maxDepth.get(node.name);
      if (prev === undefined || depth > prev) {
        maxDepth.set(node.name, depth);
      }
      for (const child of node.deps) {
        measure(child, depth + 1);
      }
    };
    for (const node of raw) {
      measure(node, 0);
    }

    const rebuild = (
      node: Natav.DriverView,
      depth: number,
    ): Natav.DriverView | null => {
      if (depth < (maxDepth.get(node.name) ?? 0)) {
        return null;
      }
      return {
        ...node,
        deps: node.deps
          .map((child) => rebuild(child, depth + 1))
          .filter((n): n is Natav.DriverView => n !== null),
      };
    };

    return raw
      .map((node) => rebuild(node, 0))
      .filter((n): n is Natav.DriverView => n !== null);
  }

  async Start(
    filter?: (
      drivers: NatavTypes.RootDrivers<D>,
    ) => Natav.PartialArray<NatavTypes.RootDrivers<D>>,
  ) {
    this.started = true;
    // TSAS: Runtime roots are structurally compatible with the caller-managed driver input.
    let configs: Natav.PartialArray<NatavTypes.RootDrivers<D>> = this
      .runtimeRoots as Natav.PartialArray<NatavTypes.RootDrivers<D>>;
    if (filter) {
      configs = filter(this.drivers);
    }

    const initializing = new Map<NatavTypes.Shape, Promise<void>>();

    const initTree = async (
      d: NatavTypes.Shape,
      path = new Set<NatavTypes.Shape>(),
    ) => {
      if (this.startedEntries.has(d)) {
        return;
      }
      if (path.has(d)) {
        throw new Error(`Natav found a dependency cycle at: ${d.name}`);
      }
      const existing = initializing.get(d);
      if (existing) {
        await existing;
        return;
      }

      const initialization = (async () => {
        // Start the dependent drivers first.
        const nextPath = new Set(path).add(d);
        for (const dep of d.deps ?? []) {
          await initTree(dep, nextPath);
        }

        await this.initDriver(d);
        this.startedEntries.add(d);
      })();

      initializing.set(d, initialization);
      await initialization;
    };

    const promises = [
      ...configs.map((d) => initTree(d)),
      ...this.plugins.map((plugin) => initTree(plugin)),
    ];

    await Promise.all(promises);
  }

  async End() {
    const entries = new Set([
      ...this.drivers_flat,
      ...this.plugins.flatMap((plugin) => {
        const collect = (
          driver: NatavTypes.Shape,
          seen = new Set<NatavTypes.Shape>(),
        ): NatavTypes.Shape[] => {
          if (seen.has(driver)) return [];
          seen.add(driver);
          return [driver, ...driver.deps.flatMap((dep) => collect(dep, seen))];
        };
        return collect(plugin);
      }),
    ]);
    const promises = [...entries].map(async (d) => {
      await d.end();
    });

    await Promise.all(promises);
    this.startedEntries.clear();
    this.started = false;
  }

  private async startEntryTree(driver: NatavTypes.Shape) {
    const initializing = new Map<NatavTypes.Shape, Promise<void>>();
    const initTree = async (
      entry: NatavTypes.Shape,
      path = new Set<NatavTypes.Shape>(),
    ): Promise<void> => {
      if (this.startedEntries.has(entry)) return;
      if (path.has(entry))
        throw new Error(`Natav found a dependency cycle at: ${entry.name}`);
      const existing = initializing.get(entry);
      if (existing) return existing;
      const promise = (async () => {
        const nextPath = new Set(path).add(entry);
        for (const dep of entry.deps) await initTree(dep, nextPath);
        await this.initDriver(entry);
        this.startedEntries.add(entry);
      })();
      initializing.set(entry, promise);
      await promise;
    };
    await initTree(driver);
  }

  private async initDriver(d: NatavTypes.Shape) {
    const name = d.name;
    if (!this.IsManagedName(name)) {
      throw new Error(`Natav.Start: ${name}`, {
        cause: Err.Codes.DriverNotFound,
      });
    }

    d.on("driver:state-updated", (event) =>
      this.bus.dispatch("natav:state:update", {
        name,
        // TSAS: d came from this manager's merged driver set, so its state matches the bus event union.
        data: event.data as Events.Natav.Map<
          Natav.DriverEntries<D, P>
        >["natav:state:update"]["data"],
      }),
    );

    d.socket?.on("debug", (event) => {
      const data = {
        name,
        data: event.data,
      };
      this.bus.dispatch("natav:debug:socket", data);

      if (data.data.direction === "tx") {
        d.tel.info("delimited", data);
      }
    });

    d.socket?.on("connected", () => {
      this.bus.dispatch("natav:driver:connected", { name });
    });

    d.socket?.on("disconnected", (event) => {
      if (event.error) {
        d.tel.error("socket got disconnected error", event);
      }
      this.bus.dispatch("natav:driver:disconnected", { name });
    });

    d.on("driver:delimited", (event) => {
      const payload = Convert.toUint8Array(event);

      const data = {
        name,
        data: {
          traceName: d.socket?.name ?? name,
          direction: "rx-delimited",
          time: Date.now(),
          encoding: "utf8",
          data: payload,
        },
      } as const;

      d.tel.info("delimited", data);

      this.bus.dispatch("natav:debug:socket", data);
    });

    await d.start();
  }
}

export namespace Natav {
  export abstract class Driver<
    Name extends string = string,
    State extends Record<string, unknown> = Record<string, unknown>,
    Deps extends readonly NatavTypes.Shape[] = readonly [],
  >
    extends DriverBase<Name, State, Deps>
    implements Natav.Shape {}
  export abstract class Plugin<
    Name extends string = string,
    State extends Record<string, unknown> = Record<string, unknown>,
    Deps extends readonly NatavTypes.Shape[] = readonly [],
  >
    extends Driver<Name, State, Deps>
    implements Natav.Shape {}
  export type Shape = NatavTypes.Shape;
  export type ApiMethod = NatavTypes.ApiMethod;
  export type ApiRecord = NatavTypes.ApiRecord;
  export type Array = NatavTypes.Array;
  export type GroupInput<T extends NatavTypes.Shape = NatavTypes.Shape> =
    NatavTypes.GroupInput<T>;
  export type GroupPaths<Input> = NatavTypes.GroupPaths<Input>;
  export type Runtime = {
    readonly input: NatavTypes.RootInput;
    readonly drivers: NatavTypes.Array;
    readonly plugins: NatavTypes.Array;
  };
  export type RootInput<T extends NatavTypes.Shape = NatavTypes.Shape> =
    NatavTypes.RootInput<T>;
  export type RootDrivers<Input extends NatavTypes.RootInput> =
    NatavTypes.RootDrivers<Input>;
  export type InputDrivers<Input> = NatavTypes.InputDrivers<Input>;
  export type PluginInput<
    T extends NatavTypes.AnyPlugin = NatavTypes.AnyPlugin,
  > = NatavTypes.PluginInput<T>;
  export type PluginGroupPaths<Input> = NatavTypes.PluginGroupPaths<Input>;
  export type PartialArray<T extends readonly unknown[]> =
    NatavTypes.PartialArray<T>;
  export type AnyPlugin<T extends NatavTypes.Shape = NatavTypes.Shape> =
    NatavTypes.AnyPlugin<T>;
  export type PluginInstances<P extends readonly NatavTypes.AnyPlugin[]> =
    NatavTypes.PluginInstances<P>;
  export type DriverEntries<
    D extends NatavTypes.RootInput,
    P extends readonly NatavTypes.AnyPlugin[],
  > = NatavTypes.DriverEntries<D, P>;
  export type ManagedEntries<
    D extends NatavTypes.RootInput,
    P extends readonly NatavTypes.AnyPlugin[],
  > = NatavTypes.ManagedEntries<D, P>;
  export type PromisifyApi<Obj> = NatavTypes.PromisifyApi<Obj>;
  export type Api<
    N extends readonly NatavTypes.Shape[],
    Name extends string,
  > = NatavTypes.Api<N, Name>;
  export type State<
    N extends readonly NatavTypes.Shape[] = NatavTypes.Array,
    Name extends string = NatavTypes.ManagedNames<
      NatavTypes.ManagedResolved<N>
    >,
  > = NatavTypes.State<N, Name>;
  export type Events<
    N extends readonly NatavTypes.Shape[],
    Name extends string,
  > = NatavTypes.Events<N, Name>;
  export type Names<N extends readonly NatavTypes.Shape[] = NatavTypes.Array> =
    NatavTypes.Names<N>;
  export type FromName<
    N extends readonly NatavTypes.Shape[],
    Name extends string = Names<N>,
  > = NatavTypes.FromName<N, Name>;
  export type Catalog<
    N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[],
  > = NatavTypes.Catalog<N>;
  export type RootCatalog<
    N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[],
  > = NatavTypes.RootCatalog<N>;
  export type DepNames<
    N extends NatavTypes.Instance,
    Name extends Names<N["drivers"]>,
  > = NatavTypes.DepNames<N, Name>;
  export type ManagedDepNames<
    N extends readonly NatavTypes.Shape[],
    Name extends string,
  > = NatavTypes.ManagedDepNames<N, Name>;
  export type ManagedResolved<
    N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[],
  > = NatavTypes.ManagedResolved<N>;
  export type ManagedClosure<Entry, Seen = never> = NatavTypes.ManagedClosure<
    Entry,
    Seen
  >;
  export type ManagedNames<Catalog> = NatavTypes.ManagedNames<Catalog>;
  export type ManagedCatalog<
    N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[],
  > = NatavTypes.ManagedCatalog<N>;
  export type ManagedHandle<D extends NatavTypes.Shape> =
    NatavTypes.ManagedHandle<D>;
  export type DriverView = NatavTypes.DriverView;
  export type ManagerView<
    N extends NatavTypes.Array = NatavTypes.Array,
    C extends NatavTypes.Array = N,
  > = NatavTypes.ManagerView<N, C>;
  export type Instance<
    D extends NatavTypes.Array = NatavTypes.Array,
    P extends readonly NatavTypes.AnyPlugin[] = readonly NatavTypes.AnyPlugin[],
  > = NatavTypes.Instance<D, P>;
}
