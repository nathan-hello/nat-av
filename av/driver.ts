import { ProtectedTypedEventTarget } from "./lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { type Bus, bus } from "./bus";
import type { DeviceSocket, DriverEvents } from "./types";

export abstract class Driver<
  Name extends string = string,
  Deps extends readonly any[] = readonly any[],
  DriverName extends string = any,
  Api = any,
  State = any,
  Socket extends Partial<DeviceSocket> | undefined = any,
> extends ProtectedTypedEventTarget<DriverEvents<State>> {
  public abstract state: State;
  public abstract api: Api;
  public abstract socket: Socket;
  public deps: Deps = [] as unknown as Deps;
  public name: Name;
  public _drivername: DriverName;
  protected tel: Telemetry;
  protected bus: Pick<Bus, "on" | "once">;

  constructor({ name, driverName }: { name: Name; driverName: DriverName }) {
    super();
    this.name = name;
    this._drivername = driverName;
    this.tel = new Telemetry(`${this._drivername}:${this.name}`);
    this.bus = bus;

    this.bus.on("natav:state:override", (payload) => {
      if (payload.name !== this.name) {
        return;
      }

      this.state = { ...this.state, ...payload.data };

      this.dispatch("driver:state-updated", this.state);
    });
  }

  protected dispatch<K extends keyof DriverEvents<State>>(
    type: K,
    payload: DriverEvents<State>[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }
}
