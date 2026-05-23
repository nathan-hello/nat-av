import { bus } from "./bus";
import type { DebugDeviceNode } from "@av/rpc/debug/types";
import { type Driver } from "./driver";
import type { NamesOf, DriverFor, StateFor } from "./types";

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

  GetDebugTree(): DebugDeviceNode[] {
    const toNode = (driver: Driver): DebugDeviceNode => {
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
        bus.dispatch("natav:state:update", {
          type: "natav:state:update",
          // TSAS:
          name: d.name as "video-wall",
          data: data,
        }),
      );

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
