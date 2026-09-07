import { Err } from "../lib/errors.js";
import { Convert } from "../lib/convert.js";
import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "../lib/eventtarget.js";
import { Telemetry } from "../telemetry/index.js";
import { type Natav as NatavTypes, type Events, type Sockets } from "../types/index.js";

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
  const D extends NatavTypes.Array = NatavTypes.Array,
  const P extends readonly NatavTypes.AnyPlugin[] = readonly NatavTypes.AnyPlugin[],
> implements NatavTypes.Instance<D, P> {
  readonly drivers: D;
  readonly plugins: NatavTypes.PluginInstances<P>;
  readonly drivers_flat: NatavTypes.Shape[] = [];
  readonly driver: NatavTypes.Catalog<NatavTypes.DriverEntries<D, P>>;
  readonly plugin: NatavTypes.RootCatalog<NatavTypes.PluginInstances<P>>;
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<NatavTypes.DriverEntries<D, P>>
  >();

  constructor(args: { drivers?: D; plugin?: P }) {
    // TSAS: The empty default is replaced by the inferred driver tuple when no drivers are supplied.
    const configs = args.drivers ?? ([] as unknown as D);

    const plugins: NatavTypes.Shape[] = [];
    for (const plugin of args.plugin ?? []) {
      const instance =
        "prototype" in plugin && typeof plugin.prototype === "object" ?
          new plugin(this)
        : plugin(this);
      plugins.push(instance);
    }

    // TSAS: The public driver tuple is the constructor input used for type inference.
    this.drivers = configs;
    // TSAS: Each plugin constructor returns the corresponding tuple entry.
    this.plugins = plugins as unknown as Natav.PluginInstances<P>;

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

    const flat = this.drivers.flatMap((driver) => collect(driver));
    for (const plugin of plugins) {
      for (const dep of plugin.deps) {
        flat.push(...collect(dep));
      }
    }
    const byName = new Map<string, NatavTypes.Shape>();
    for (const driver of flat) {
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

  private FindDriverTyped<
    N extends Natav.Names<Natav.DriverEntries<D, P>>,
  >(
    name: N,
  ): Natav.FromName<Natav.DriverEntries<D, P>, N> | undefined {
    return this.drivers_flat.find(
      (d): d is Natav.FromName<Natav.DriverEntries<D, P>, N> =>
        d.name === name,
    );
  }

  private IsDriverName(
    name: string,
  ): name is Natav.Names<Natav.DriverEntries<D, P>> {
    return this.drivers_flat.some((driver) => driver.name === name);
  }

  private IsManagedName(name: string): boolean {
    return this.IsDriverName(name) || this.plugins.some((plugin) => plugin.name === name);
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

    const raw = this.drivers.map((driver) => toNode(driver));

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
      drivers: D,
    ) => Natav.PartialArray<D>,
  ) {
    let configs: Natav.PartialArray<D> = this.drivers;
    if (filter) {
      configs = filter(this.drivers);
    }

    const inited = new Set<NatavTypes.Shape>();
    const initializing = new Map<NatavTypes.Shape, Promise<void>>();

    const initTree = async (
      d: NatavTypes.Shape,
      path = new Set<NatavTypes.Shape>(),
    ) => {
      if (inited.has(d)) {
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
        inited.add(d);
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
        const collect = (driver: NatavTypes.Shape, seen = new Set<NatavTypes.Shape>()): NatavTypes.Shape[] => {
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
  > extends DriverBase<Name, State, Deps> implements Natav.Shape {}
  export abstract class Plugin<
    Name extends string = string,
    State extends Record<string, unknown> = Record<string, unknown>,
    Deps extends readonly NatavTypes.Shape[] = readonly [],
  > extends Driver<Name, State, Deps> implements Natav.Shape {}
  export type Shape = NatavTypes.Shape;
  export type ApiMethod = NatavTypes.ApiMethod;
  export type ApiRecord = NatavTypes.ApiRecord;
  export type Array = NatavTypes.Array;
  export type PartialArray<T extends readonly unknown[]> = NatavTypes.PartialArray<T>;
  export type AnyPlugin<T extends NatavTypes.Shape = NatavTypes.Shape> = NatavTypes.AnyPlugin<T>;
  export type PluginInstances<P extends readonly NatavTypes.AnyPlugin[]> = NatavTypes.PluginInstances<P>;
  export type DriverEntries<D extends NatavTypes.Array, P extends readonly NatavTypes.AnyPlugin[]> = NatavTypes.DriverEntries<D, P>;
  export type ManagedEntries<D extends NatavTypes.Array, P extends readonly NatavTypes.AnyPlugin[]> = NatavTypes.ManagedEntries<D, P>;
  export type PromisifyApi<Obj> = NatavTypes.PromisifyApi<Obj>;
  export type Api<N extends readonly NatavTypes.Shape[], Name extends string> = NatavTypes.Api<N, Name>;
  export type State<N extends readonly NatavTypes.Shape[] = NatavTypes.Array, Name extends string = NatavTypes.ManagedNames<NatavTypes.ManagedResolved<N>>> = NatavTypes.State<N, Name>;
  export type Events<N extends readonly NatavTypes.Shape[], Name extends string> = NatavTypes.Events<N, Name>;
  export type Names<N extends readonly NatavTypes.Shape[] = NatavTypes.Array> = NatavTypes.Names<N>;
  export type FromName<N extends readonly NatavTypes.Shape[], Name extends string = Names<N>> = NatavTypes.FromName<N, Name>;
  export type Catalog<N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[]> = NatavTypes.Catalog<N>;
  export type RootCatalog<N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[]> = NatavTypes.RootCatalog<N>;
  export type DepNames<N extends NatavTypes.Instance, Name extends Names<N["drivers"]>> = NatavTypes.DepNames<N, Name>;
  export type ManagedDepNames<N extends readonly NatavTypes.Shape[], Name extends string> = NatavTypes.ManagedDepNames<N, Name>;
  export type ManagedResolved<N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[]> = NatavTypes.ManagedResolved<N>;
  export type ManagedClosure<Entry, Seen = never> = NatavTypes.ManagedClosure<Entry, Seen>;
  export type ManagedNames<Catalog> = NatavTypes.ManagedNames<Catalog>;
  export type ManagedCatalog<N extends readonly NatavTypes.Shape[] = readonly NatavTypes.Shape[]> = NatavTypes.ManagedCatalog<N>;
  export type ManagedHandle<D extends NatavTypes.Shape> = NatavTypes.ManagedHandle<D>;
  export type DriverView = NatavTypes.DriverView;
  export type ManagerView<N extends NatavTypes.Array = NatavTypes.Array, C extends NatavTypes.Array = N> = NatavTypes.ManagerView<N, C>;
  export type Instance<D extends NatavTypes.Array = NatavTypes.Array, P extends readonly NatavTypes.AnyPlugin[] = readonly NatavTypes.AnyPlugin[]> = NatavTypes.Instance<D, P>;
}
