import { Err } from "@nat-av/core/client";
import { Convert } from "@nat-av/core/lib/convert";
import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "@nat-av/core/lib/eventtarget";
import { Telemetry } from "@nat-av/core/telemetry";
import { type Drivers, type Events, type Sockets } from "@nat-av/core/types";

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
  const S extends readonly Drivers.AnyDeferred[] =
    readonly Drivers.AnyDeferred[],
  const P extends readonly Drivers.AnyDeferred[] =
    readonly Drivers.AnyDeferred[],
> implements Drivers.Manager<D, S, P> {
  readonly drivers: Drivers.Merged<D, S>;
  readonly drivers_flat: Drivers.AnyDriver[] = [];
  readonly driver: Drivers.Catalog<Drivers.Merged<D, S>>;
  readonly plugin: Drivers.Catalog<Drivers.DeferredInstances<P>>;
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<Drivers.Merged<D, S>>
  >();

  constructor(args: { drivers?: D; deferred?: S; plugins?: P }) {
    let configs: Drivers.AnyDriver[] = [];
    if (args.drivers) {
      configs = [...args.drivers];
    }

    if (args.deferred) {
      for (const deferred of args.deferred) {
        if ("prototype" in deferred && typeof deferred.prototype === "object") {
          configs.push(new deferred(this));
        } else {
          configs.push(deferred(this));
        }
      }
    }

    // TSAS: The public configs property is the tuple-shaped merged driver set for type inference.
    this.drivers = configs as unknown as Drivers.Merged<D, S>;

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
    // TSAS: The runtime catalog is populated from every collected driver's literal name.
    this.driver = drivers as Drivers.Catalog<Drivers.Merged<D, S>>;

    const plugins: Drivers.AnyDriver[] = [];
    for (const plugin of args.plugins ?? []) {
      const instance =
        "prototype" in plugin && typeof plugin.prototype === "object" ?
          new plugin(this)
        : plugin(this);
      plugins.push(instance);
    }

    const pluginByName = new Map<string, Drivers.AnyDriver>();
    for (const plugin of plugins) {
      if (plugin.name in this.driver) {
        throw new Error(`Plugin name conflicts with driver: ${plugin.name}`);
      }
      if (pluginByName.has(plugin.name)) {
        throw new Error(
          `Manager found multiple plugins of the same name: ${plugin.name}`,
        );
      }
      pluginByName.set(plugin.name, plugin);
    }
    // TSAS: Plugin constructors are checked by P and the map is keyed by each plugin name.
    this.plugin = Object.fromEntries(pluginByName) as Drivers.Catalog<
      Drivers.DeferredInstances<P>
    >;
  }

  GetDriver<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> {
    const found = this.FindDriverTyped(name);
    if (!found) {
      throw new Error(`Manager.GetDriver: ${name}`, {
        cause: Err.Codes.DriverCallFailed,
      });
    }

    return found;
  }

  FindDriver(name: string): Drivers.AnyDriver | undefined {
    return this.drivers_flat.find((d) => d.name === name);
  }

  private FindDriverTyped<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> | undefined {
    return this.drivers_flat.find(
      (d): d is Drivers.FromName<Drivers.Merged<D, S>, N> => d.name === name,
    );
  }

  private IsDriverName(
    name: string,
  ): name is Drivers.Names<Drivers.Merged<D, S>> {
    return this.drivers_flat.some((driver) => driver.name === name);
  }

  GetAllDriverNames(): Drivers.Names<Drivers.Merged<D, S>>[] {
    return this.drivers_flat
      .map((d) => d.name)
      .filter((name): name is Drivers.Names<Drivers.Merged<D, S>> =>
        this.IsDriverName(name),
      );
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
      drivers: Drivers.Merged<D, S>,
    ) => Drivers.PartialArray<Drivers.Merged<D, S>>,
  ) {
    let configs: Drivers.PartialArray<Drivers.Merged<D, S>> = this.drivers;
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

    const promises = configs.map((d) => initTree(d));

    await Promise.all(promises);
    // TSAS: Plugin catalog values are all constructed Driver instances.
    await Promise.all(
      (Object.values(this.plugin) as Drivers.AnyDriver[]).map((plugin) =>
        plugin.start(),
      ),
    );
  }

  async End() {
    // TSAS: Plugin catalog values are all constructed Driver instances.
    await Promise.all(
      (Object.values(this.plugin) as Drivers.AnyDriver[]).map((plugin) =>
        plugin.end(),
      ),
    );
    const promises = this.drivers.map(async (d) => {
      await d.end();
    });

    await Promise.all(promises);
  }

  private async initDriver(d: Drivers.AnyDriver) {
    const name = d.name;
    if (!this.IsDriverName(name)) {
      throw new Error(`Manager.Start: ${name}`, {
        cause: Err.Codes.DriverNotFound,
      });
    }

    d.on("driver:state-updated", (event) =>
      this.bus.dispatch("natav:state:update", {
        name,
        // TSAS: d came from this manager's merged driver set, so its state matches the bus event union.
        data: event.data as Events.Natav.Map<
          Drivers.Merged<D, S>
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
