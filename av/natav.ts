import { bus } from "./bus";
import { type Driver } from "./driver";
import type { NamesOf, DriverFor, StateFor, Rpc} from "./types";

export class Orchistrator<
  const Configs extends readonly Driver[] = readonly Driver[],
> {
  readonly configs: Configs;

  constructor(configs: Configs) {
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

  GetDriver<N extends NamesOf<Configs>>(name: N): DriverFor<Configs, N> {
    // TSAS:
    return this.FindDriver(name) as DriverFor<Configs, N>;
  }

  GetDriverState<N extends NamesOf<Configs>>(name: N): StateFor<Configs, N> {
    return this.GetDriver(name).state;
  }

  FindDriver(name: string): Driver | undefined {
    return this.all().find((d) => d.name === name);
  }

  GetAllDriverNames(): string[] {
    return this.all().map((d) => d.name);
  }

  GetDebugTree(): Rpc.Client.Debug.Node[] {
    const toNode = (driver: Driver): Rpc.Client.Debug.Node => {
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
