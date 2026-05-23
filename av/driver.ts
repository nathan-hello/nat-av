import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { bus } from "@av/bus";
import type { ApiRecord, DeviceSocket, Schema, Events } from "@av/types";

type AnyDriver = Driver<
  string,
  Record<string, AnyDriver>,
  string,
  ApiRecord,
  Record<string, any>,
  Partial<DeviceSocket> | undefined
>;

type DependencyInput = readonly AnyDriver[] | readonly { driver: AnyDriver }[];

export abstract class Driver<
  Name extends string = string,
  Deps extends Record<string, AnyDriver> = {},
  DriverName extends string = any,
  Api extends ApiRecord = ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Socket extends Partial<DeviceSocket> | undefined = any,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  public abstract socket: Socket;
  public abstract schema?: () => Schema<Api> | Promise<Schema<Api>>;

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

  setDependencies(v: DependencyInput) {
    function unwrapDriver(v: DependencyInput[number]): AnyDriver {
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
