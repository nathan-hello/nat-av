import { ProtectedTypedEventTarget } from "./lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { type Bus, bus } from "./bus";
import type { DeviceSocket, DriverEvents } from "./types";
import type {} from "@av/driver";

type AnyDriver = Driver<
  string,
  Record<string, AnyDriver>,
  string,
  unknown,
  unknown,
  Partial<DeviceSocket>
>;

type DependencyInput = readonly AnyDriver[] | readonly { driver: AnyDriver }[];

export abstract class Driver<
  Name extends string = string,
  Deps extends Record<string, AnyDriver> = {},
  DriverName extends string = any,
  Api = any,
  State = any,
  Socket extends Partial<DeviceSocket> = Partial<DeviceSocket>,
> extends ProtectedTypedEventTarget<DriverEvents<State>> {
  public abstract state: State;
  public abstract api: Api;
  public abstract socket: Socket;
  public deps: Deps = {} as Deps;
  public name: Name;
  public _drivername: DriverName;
  protected tel: Telemetry;
  protected bus: Pick<Bus, "on" | "once">;

  constructor({ name, driverName }: { name: Name; driverName: DriverName }) {
    super();
    this.name = name;
    this._drivername = driverName;
    this.tel = new Telemetry(`Driver::${this.name}`);
    this.bus = bus;

    this.bus.on("natav:state:override", (payload) => {
      if (payload.name !== this.name) {
        return;
      }

      this.state = { ...this.state, ...payload.data };

      this.dispatch("driver:state-updated", this.state);
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

  protected dispatch<K extends keyof DriverEvents<State>>(
    type: K,
    payload: DriverEvents<State>[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }
}
