import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { bus } from "@av/bus";
import type { Sockets, Schema, Events } from "@av/types";
import type { Drivers } from "@av/types/drivers";

export abstract class Driver<
  Name extends string = string,
  Deps extends Drivers.Dependency = {},
  DriverName extends string = string,
  Api extends Drivers.ApiRecord = Drivers.ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Socket extends Partial<Sockets.Socket> | undefined = any,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  public abstract socket: Socket;
  public abstract schema?: () =>
    | Schema.Schema<Api>
    | Promise<Schema.Schema<Api>>;

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

  setDependencies(v: Drivers.DependencyInput) {
    function unwrapDriver(
      v: Drivers.DependencyInput[number],
    ): Drivers.AnyDriver {
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
