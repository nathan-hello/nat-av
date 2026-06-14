import { bus } from "@av/lib/bus";
import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import type { Drivers, Events, Rpc, Schema, Sockets } from "@av/types";

export abstract class Driver<
  Name extends string = string,
  Deps extends Drivers.Dep.TRecord = {},
  DriverName extends string = string,
  Api extends Drivers.ApiRecord = Drivers.ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Events extends TypedEventTarget<any> | undefined = TypedEventTarget<{
    [x: string]: Rpc.JSONValue;
  }>,
  Socket extends Partial<Sockets.Client> | undefined = any,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  public abstract socket: Socket;
  public abstract schema?: () =>
    | Schema.Schema<Api>
    | Promise<Schema.Schema<Api>>;

  // TSAS:
  public events: Events = undefined as Events;

  // TSAS:
  public deps: Deps = {} as Deps;
  public name: Name;
  public _drivername: DriverName;
  protected tel: Telemetry;

  constructor({ name, driverName }: { name: Name; driverName: DriverName }) {
    super();
    this.name = name;
    this._drivername = driverName;
    this.tel = new Telemetry(`Driver::${this.name}`);

    bus.on("natav:state:override", (payload) => {
      if (payload.name !== this.name) {
        return;
      }

      this.state = { ...this.state, ...payload.data };

      this.dispatch("driver:state-updated", {
        data: this.state,
      });
    });
  }

  setDependencies(v: Drivers.Dep.Input) {
    function unwrapDriver(v: Drivers.Dep.Input[number]) {
      return "driver" in v ? v.driver : v;
    }

    if (v.length === 0) {
      return;
    }

    for (const d of v) {
      const unwrapped = unwrapDriver(d);
      // @ts-ignore-next-line
      this.deps[unwrapped.name] = unwrapped;
    }
  }

  dep<N extends keyof Deps & string>(name: N): Deps[N] {
    return this.deps[name];
  }

  protected dispatch<K extends keyof Events.Driver.Map>(
    type: K,
    payload: Events.Driver.Map[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }
}

export class Manager<const D extends Drivers.Array = Drivers.Array> {
  readonly configs: D;

  constructor(configs: D) {
    this.configs = configs;
  }

  private all(): Driver[] {
    const collect = (drivers: readonly Driver[]): Driver[] =>
      // TSAS:
      drivers.flatMap((d) => [
        d,
        ...collect(Object.values(d.deps) as readonly Driver[]),
      ]);

    return collect(this.configs);
  }

  GetDriver<N extends Drivers.Names<D>>(name: N): Drivers.FromName<D, N> {
    // TSAS:
    return this.FindDriver(name) as Drivers.FromName<D, N>;
  }

  GetDriverState<N extends Drivers.Names<D>>(name: N): Drivers.State<D, N> {
    return this.GetDriver(name).state;
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
        children: Object.values(driver.deps as Record<string, Driver>).map(
          (child) => toNode(child),
        ),
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

  async Start() {
    this.configs.forEach((d) => {
      d.on("driver:state-updated", (data) =>
        // TS doesn't know about the Names/State impls within this class.
        // @ts-ignore-next-line
        bus.dispatch("natav:state:update", { name: d.name, data: data.data }),
      );

      d.on("driver:delimited", (payload) => {
        bus.dispatch("natav:debug:socket", {
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

      d.socket?.start?.();
    });
  }

  async End() {
    await Promise.all(
      this.configs.map(async (d) => {
        await d.socket?.end?.();
      }),
    );
  }
}
