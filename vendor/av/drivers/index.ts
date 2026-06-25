import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import {
  Format,
  Rpc,
  type Drivers,
  type Events,
  type Sockets,
} from "@av/types";
import { AsyncLocalStorage } from "node:async_hooks";

type EventsMaybe = TypedEventTarget<any> | undefined;
type SocketMaybe = Partial<Sockets.Client> | undefined;

export abstract class Driver<
  Name extends string = string,
  Deps extends Drivers.Array = Drivers.Array,
  Api extends Drivers.ApiRecord = Drivers.ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Events extends EventsMaybe = EventsMaybe,
  Socket extends SocketMaybe = SocketMaybe,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  // TSAS:
  public socket: Socket = undefined as Socket;

  // TSAS: Subclasses or runtime wiring provide the concrete event target shape before use.
  public events: Events = undefined as Events;
  public name: Name;
  public deps: Deps = [] as unknown as Deps;
  public tel: Telemetry;

  constructor({ name, deps }: { name: Name; deps?: Deps }) {
    super();
    if (deps) {
      this.deps = deps;
    }
    this.name = name;
    this.tel = new Telemetry(`Driver::${this.name}`);
  }

  protected dispatch<K extends keyof Events.Driver.Map>(
    type: K,
    payload: Events.Driver.Map[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }

  public start(): Promise<void> | void {
    this.socket?.start?.();
  }
  public end(): Promise<void> | void {
    this.socket?.end?.();
  }

  public dep<K extends NonNullable<Deps>[number]["name"]>(
    name: K,
  ): Extract<NonNullable<Deps>[number], { name: K }> {
    const child = this.deps?.find(
      (d): d is Extract<NonNullable<Deps>[number], { name: K }> =>
        d.name === name,
    );

    if (!child) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.DriverNotFound,
        message: `Driver.dep: ${name}`,
      });
    }

    return child;
  }
}

export class Manager<
  const D extends Drivers.Array = Drivers.Array,
  const S extends readonly Drivers.AnyDeferred[] =
    readonly Drivers.AnyDeferred[],
  Context extends Drivers.Context = Drivers.Context,
> implements Drivers.Manager<D, S, Context> {
  readonly configs: Drivers.Merged<D, S>;
  readonly configs_flat: Driver[] = [];
  private contextStore = new AsyncLocalStorage<Context>();
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<Drivers.Merged<D, S>>
  >();

  GetContext() {
    const ctx = this.contextStore.getStore();
    if (!ctx) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.CtxNotFound,
        message: `Manager.GetContext: ${JSON.stringify(this.contextStore)}`,
      });
    }
    return ctx;
  }

  constructor(args: { drivers?: D; deferred?: S }) {
    let configs: Driver[] = [];
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
    this.configs = configs as unknown as Drivers.Merged<D, S>;

    const collect = (driver: Driver): Driver[] => {
      const out: Driver[] = [driver];
      for (const dep of driver.deps ?? []) {
        out.push(...collect(dep));
      }
      return out;
    };

    this.configs_flat = this.configs.flatMap(collect);
  }

  runWithContext<T>(context: Context, fn: () => T): T {
    return this.contextStore.run(context, fn);
  }

  GetDriver<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> {
    const found = this.FindDriverTyped(name);
    if (!found) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.DriverCallFailed,
        message: `Manager.GetDriver: ${name}`,
      });
    }

    return found;
  }

  FindDriver(name: string): Driver | undefined {
    return this.configs_flat.find((d) => d.name === name);
  }

  private FindDriverTyped<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> | undefined {
    return this.configs_flat.find(
      (d): d is Drivers.FromName<Drivers.Merged<D, S>, N> => d.name === name,
    );
  }

  private IsDriverName(
    name: string,
  ): name is Drivers.Names<Drivers.Merged<D, S>> {
    return this.configs_flat.some((driver) => driver.name === name);
  }

  GetAllDriverNames(): Drivers.Names<Drivers.Merged<D, S>>[] {
    return this.configs_flat
      .map((d) => d.name)
      .filter((name): name is Drivers.Names<Drivers.Merged<D, S>> =>
        this.IsDriverName(name),
      );
  }

  GetTree(): Drivers.DriverView[] {
    const toNode = (driver: Drivers.AnyDriver): Drivers.DriverView => {
      const socket = driver.socket;
      const canWrite = typeof socket?.write === "function";
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

    return this.configs.map((driver) => toNode(driver));
  }

  async Start(
    filter?: (
      drivers: Drivers.Merged<D, S>,
    ) => Drivers.PartialArray<Drivers.Merged<D, S>>,
  ) {
    let configs: Drivers.PartialArray<Drivers.Merged<D, S>> = this.configs;
    if (filter) {
      configs = filter(this.configs);
    }

    const inited = new Set<string>();

    const initTree = async (d: Driver) => {
      if (inited.has(d.name)) {
        throw new Rpc.Error({
          code: Rpc.Error.Codes.ManagerFoundMultipleNames,
          message: `Manager found multiple drivers of the same name: ${d.name}.\nthis.configs: ${JSON.stringify(this.configs)}`,
        });
      }

      // Start the dependent drivers first
      for (const dep of d.deps ?? []) {
        await initTree(dep);
      }

      await this.initDriver(d);
      inited.add(d.name);
    };

    const promises = configs.map((d) => initTree(d));

    await Promise.all(promises);
  }

  async End() {
    const promises = this.configs.map(async (d) => {
      await d.end();
    });

    await Promise.all(promises);
  }

  private async initDriver(d: Driver) {
    const name = d.name;
    if (!this.IsDriverName(name)) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.DriverNotFound,
        message: `Manager.Start: ${name}`,
      });
    }

    d.on("driver:state-updated", (event) =>
      this.bus.dispatch("natav:state:update", {
        name,
        data: event.data,
      }),
    );

    d.socket?.on?.("debug", (event) => {
      const data = {
        name,
        data: event.data,
      };
      this.bus.dispatch("natav:debug:socket", data);

      if (data.data.direction === "tx") {
        d.tel.info("delimited", data);
      }
    });

    d.on("driver:delimited", (event) => {
      const payload = Format.Convert.toUint8Array(event);

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
