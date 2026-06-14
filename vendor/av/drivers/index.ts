import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import type { Drivers, Events, Rpc, Schema, Sockets } from "@av/types";

type EventsMaybe = TypedEventTarget<any> | undefined;
type SocketMaybe = Partial<Sockets.Client> | undefined;

export abstract class Driver<
  Name extends string = string,
  Deps extends Drivers.Dep.TRecord = {},
  DriverName extends string = string,
  Api extends Drivers.ApiRecord = Drivers.ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Events extends EventsMaybe = EventsMaybe,
  Socket extends SocketMaybe = SocketMaybe,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  // TSAS:
  public socket: Socket = undefined as Socket;
  public schema?: () => Schema.Schema<Api> | Promise<Schema.Schema<Api>> =
    undefined;

  // TSAS: Subclasses or runtime wiring provide the concrete event target shape before use.
  public events: Events = undefined as Events;
  // TSAS: This anchor keeps the resolved dependency record available for type recursion.
  declare public _deps: Deps;
  public name: Name;
  public _drivername: DriverName;
  public deps: Drivers.Dep.Handle<Deps> = new DependencyManager<Deps>();
  protected tel: Telemetry;

  constructor({ name, driverName }: { name: Name; driverName: DriverName }) {
    super();
    this.name = name;
    this._drivername = driverName;
    this.tel = new Telemetry(`Driver::${this.name}`);
  }

  protected dispatch<K extends keyof Events.Driver.Map>(
    type: K,
    payload: Events.Driver.Map[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }

  public async start() {
    await this.socket?.start?.();
  }
  public async end() {
    await this.socket?.end?.();
  }
}

class DependencyManager<Deps extends Drivers.Dep.TRecord> implements Drivers.Dep
  .Handle<Deps> {
  // TSAS: Drivers start with no dependencies and fill this record during construction.
  private _deps: Deps = {} as Deps;

  constructor(input?: Drivers.Dep.Input) {
    if (input) {
      this.set(input);
    }
  }

  public get(): Deps;
  public get<N extends keyof Deps & string>(name: N): Deps[N];
  public get(name?: string): any {
    return name ? this._deps[name] : this._deps;
  }

  public set(vd: Drivers.Dep.Input): void {
    if (!Array.isArray(vd)) {
      // TSAS: Non-array dep inputs are already keyed dependency records.
      this._deps = vd as Deps;
      return;
    }

    const nextDeps: Record<string, Drivers.AnyDriver> = { ...this._deps };
    for (const entry of vd) {
      const driver = "driver" in entry ? entry.driver : entry;
      nextDeps[driver.name] = driver;
    }
    this._deps = nextDeps as Deps;
  }
}
export class Manager<
  const D extends Drivers.Array = Drivers.Array,
  const S extends readonly Drivers.AnyDeferred[] =
    readonly Drivers.AnyDeferred[],
> implements Drivers.Manager<D, S> {
  readonly configs: Drivers.Merged<D, S>;
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<Drivers.Merged<D, S>>
  >();

  constructor(args: { drivers?: D; deferred?: S }) {
    let configs: Drivers.Merged<D, S>[number][] = [];
    if (args.drivers) {
      configs = [...args.drivers];
    }

    this.configs = configs;

    if (args.deferred) {
      for (const deferred of args.deferred) {
        // TSAS: Deferred entries are either constructors or factories returning drivers.
        if ("prototype" in deferred && typeof deferred.prototype === "object") {
          configs.push(new deferred(this));
        } else {
          configs.push(deferred(this));
        }
      }
    }
  }

  private all(): Driver[] {
    const collect = (drivers: readonly Driver[]): Driver[] =>
      // TSAS: Runtime dependency managers only store driver instances keyed by name.
      drivers.flatMap((d) => [d, ...collect(Object.values(d.deps.get()))]);

    return collect(this.configs);
  }

  GetDriver<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> {
    // TSAS:
    return this.FindDriver(name) as Drivers.FromName<Drivers.Merged<D, S>, N>;
  }

  GetDriverState<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.State<Drivers.Merged<D, S>, N> {
    // TSAS: Runtime driver lookup guarantees the returned instance matches the merged configs tuple.
    return this.GetDriver(name).state as Drivers.State<Drivers.Merged<D, S>, N>;
  }

  FindDriver(name: string): Driver | undefined {
    return this.all().find((d) => d.name === name);
  }

  GetAllDriverNames(): string[] {
    return this.all().map((d) => d.name);
  }

  GetDebugTree(): Rpc.Debug.Node[] {
    const toNode = (driver: Driver): Rpc.Debug.Node => {
      const socket = driver.socket;
      const canWrite = typeof socket?.write === "function";
      const canReceive = typeof socket?.on === "function";

      return {
        name: driver.name,
        driverName: driver._drivername,
        children: Object.values(
          driver.deps.get() as Record<string, Driver>,
        ).map((child) => toNode(child)),
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

    const promises = configs.map(async (d) => {
      d.on("driver:state-updated", (data) =>
        // TSAS: Each iterated driver comes from this manager's merged config tuple, so its name and state match the bus event union.
        this.bus.dispatch("natav:state:update", {
          name: d.name,
          data: data.data,
        }),
      );

      d.socket?.on?.("debug", (data) => {
        this.bus.dispatch("natav:debug:socket", data);
      });

      d.on("driver:delimited", (payload) => {
        this.bus.dispatch("natav:debug:socket", {
          data: {
            traceName: d.socket?.name ?? d.name,
            direction: "rx-delimited",
            time: new Date().toISOString(),
            encoding: "utf8",
            text: payload.toString("utf8"),
            hex: payload.toString("hex"),
            length: payload.length,
          },
        });
      });

      await d.start();
    });

    await Promise.all(promises);
  }

  async End() {
    const promises = this.configs.map(async (d) => {
      await d.end();
    });

    await Promise.all(promises);
  }
}
