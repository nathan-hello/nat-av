import { Err } from "../lib/errors.js";
import { Convert } from "../lib/convert.js";
import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "../lib/eventtarget.js";
import { Telemetry } from "../telemetry/index.js";
import { type Drivers, type Events, type Sockets } from "../types/index.js";

type EventsMaybe = TypedEventTarget<any> | undefined;
type SocketMaybe = Sockets.Socket | undefined;

export abstract class Driver<
  Name extends string = string,
  State extends Record<string, unknown> = Record<string, unknown>,
  Deps extends readonly Drivers.DriverShape[] = readonly [],
> extends ProtectedTypedEventTarget<Events.Driver.Map<State>> {
  public abstract state: State;
  public abstract api: Drivers.ApiRecord;

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

export class Manager<
  const D extends Drivers.Array = Drivers.Array,
  const P extends readonly Drivers.AnyPlugin[] = readonly Drivers.AnyPlugin[],
> implements Drivers.Manager<D, P> {
  readonly drivers: D;
  readonly plugins: Drivers.PluginInstances<P>;
  readonly drivers_flat: Drivers.AnyDriver[] = [];
  readonly driver: Drivers.Catalog<Drivers.DriverEntries<D, P>>;
  readonly plugin: Drivers.RootCatalog<Drivers.PluginInstances<P>>;
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<Drivers.DriverEntries<D, P>>
  >();

  constructor(args: { drivers?: D; plugin?: P }) {
    // TSAS: The empty default is replaced by the inferred driver tuple when no drivers are supplied.
    const configs = args.drivers ?? ([] as unknown as D);

    const plugins: Drivers.AnyDriver[] = [];
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
    this.plugins = plugins as unknown as Drivers.PluginInstances<P>;

    const collect = (
      driver: Drivers.AnyDriver,
      seen = new Set<Drivers.AnyDriver>(),
    ): Drivers.AnyDriver[] => {
      if (seen.has(driver)) return [];
      seen.add(driver);
      const out: Drivers.AnyDriver[] = [driver];
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
    const byName = new Map<string, Drivers.AnyDriver>();
    for (const driver of flat) {
      const existing = byName.get(driver.name);
      if (existing && existing !== driver) {
        throw new Error(
          `Manager found multiple drivers of the same name: ${driver.name}`,
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
    this.driver = drivers as Drivers.Catalog<Drivers.DriverEntries<D, P>>;

    const pluginByName = new Map<string, Drivers.AnyDriver>();
    for (const plugin of plugins) {
      if (
        pluginByName.has(plugin.name) &&
        pluginByName.get(plugin.name) !== plugin
      ) {
        throw new Error(
          `Manager found multiple plugins of the same name: ${plugin.name}`,
        );
      }
      pluginByName.set(plugin.name, plugin);
    }
    // TSAS: Plugin constructors are checked by P and the map is keyed by each plugin name.
    this.plugin = Object.fromEntries(pluginByName) as Drivers.RootCatalog<
      Drivers.PluginInstances<P>
    >;
  }

  GetDriver<N extends Drivers.Names<Drivers.DriverEntries<D, P>>>(
    name: N,
  ): Drivers.FromName<Drivers.DriverEntries<D, P>, N> {
    const found = this.FindDriverTyped(name);
    if (!found) {
      throw new Error(`Manager.GetDriver: ${name}`, {
        cause: Err.Codes.DriverCallFailed,
      });
    }

    return found;
  }

  Get(name: string): Drivers.AnyDriver;
  Get<N extends Drivers.Names<Drivers.ManagedEntries<D, P>>>(
    name: N,
  ): Drivers.FromName<Drivers.ManagedEntries<D, P>, N>;
  Get(name: string): Drivers.AnyDriver {
    const found = this.FindDriver(name) ?? this.FindPlugin(name);
    if (!found) {
      throw new Error(`Manager.Get: ${name}`, {
        cause: Err.Codes.DriverCallFailed,
      });
    }

    // TSAS: The name lookup checks both catalogs before returning the matching entry.
    return found;
  }

  FindDriver(name: string): Drivers.AnyDriver | undefined {
    return this.drivers_flat.find((d) => d.name === name);
  }

  FindPlugin(name: string): Drivers.AnyDriver | undefined {
    return this.plugins.find((plugin) => plugin.name === name);
  }

  private FindDriverTyped<
    N extends Drivers.Names<Drivers.DriverEntries<D, P>>,
  >(
    name: N,
  ): Drivers.FromName<Drivers.DriverEntries<D, P>, N> | undefined {
    return this.drivers_flat.find(
      (d): d is Drivers.FromName<Drivers.DriverEntries<D, P>, N> =>
        d.name === name,
    );
  }

  private IsDriverName(
    name: string,
  ): name is Drivers.Names<Drivers.DriverEntries<D, P>> {
    return this.drivers_flat.some((driver) => driver.name === name);
  }

  private IsManagedName(name: string): boolean {
    return this.IsDriverName(name) || this.plugins.some((plugin) => plugin.name === name);
  }

  GetAllDriverNames(): Drivers.Names<Drivers.DriverEntries<D, P>>[] {
    return this.drivers_flat
      .map((d) => d.name)
      .filter((name): name is Drivers.Names<Drivers.DriverEntries<D, P>> =>
        this.IsDriverName(name),
      );
  }

  GetAllPluginNames(): Drivers.Names<Drivers.PluginInstances<P>>[] {
    // TSAS: Plugin roots came from the constructor tuple and retain its name union.
    return this.plugins.map((plugin) => plugin.name) as Drivers.Names<
      Drivers.PluginInstances<P>
    >[];
  }

  GetTree(): Drivers.DriverView[] {
    const toNode = (driver: Drivers.AnyDriver): Drivers.DriverView => {
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
    const measure = (node: Drivers.DriverView, depth: number) => {
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
      node: Drivers.DriverView,
      depth: number,
    ): Drivers.DriverView | null => {
      if (depth < (maxDepth.get(node.name) ?? 0)) {
        return null;
      }
      return {
        ...node,
        deps: node.deps
          .map((child) => rebuild(child, depth + 1))
          .filter((n): n is Drivers.DriverView => n !== null),
      };
    };

    return raw
      .map((node) => rebuild(node, 0))
      .filter((n): n is Drivers.DriverView => n !== null);
  }

  async Start(
    filter?: (
      drivers: D,
    ) => Drivers.PartialArray<D>,
  ) {
    let configs: Drivers.PartialArray<D> = this.drivers;
    if (filter) {
      configs = filter(this.drivers);
    }

    const inited = new Set<Drivers.AnyDriver>();
    const initializing = new Map<Drivers.AnyDriver, Promise<void>>();

    const initTree = async (
      d: Drivers.AnyDriver,
      path = new Set<Drivers.AnyDriver>(),
    ) => {
      if (inited.has(d)) {
        return;
      }
      if (path.has(d)) {
        throw new Error(`Manager found a dependency cycle at: ${d.name}`);
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
        const collect = (driver: Drivers.AnyDriver, seen = new Set<Drivers.AnyDriver>()): Drivers.AnyDriver[] => {
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

  private async initDriver(d: Drivers.AnyDriver) {
    const name = d.name;
    if (!this.IsManagedName(name)) {
      throw new Error(`Manager.Start: ${name}`, {
        cause: Err.Codes.DriverNotFound,
      });
    }

    d.on("driver:state-updated", (event) =>
      this.bus.dispatch("natav:state:update", {
        name,
        // TSAS: d came from this manager's merged driver set, so its state matches the bus event union.
        data: event.data as Events.Natav.Map<
          Drivers.DriverEntries<D, P>
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
