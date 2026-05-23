import { bus } from "./bus";
import type { DebugDeviceNode } from "@av/rpc/debug/types";
import { type Driver } from "./driver";
import type {
  NamesOf,
  DriverFor,
  StateFor,
  ApiFor,
  DepsOf,
  DepNamesOf,
  DepFor,
  DriverHandle,
} from "./types";

class Natav<const Configs extends readonly Driver[] = readonly Driver[]> {
  readonly configs: Configs;

  constructor(configs: Configs) {
    this.configs = configs;
  }

  private all(): Driver[] {
    const collect = (drivers: readonly Driver[]): Driver[] =>
      // TSAS:
      drivers.flatMap((d) => [d, ...collect(Object.values(d.deps) as readonly Driver[])]);

    return collect(this.configs);
  }

  GetDriver<N extends NamesOf<Configs>>(name: N) {
    // TSAS:
    return this.FindDriver(name) as DriverFor<Configs, N>;
  }

  GetDriverState<N extends NamesOf<Configs>>(name: N) {
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
        children: Object.values(driver.deps as Record<string, Driver>).map((child) =>
          toNode(child),
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

namespace Natav {
  export type ConfigsOf<N extends Natav> = N extends Natav<infer C> ? C : never;
  export type Names<N extends Natav> = NamesOf<ConfigsOf<N>>;
  export type Driver<N extends Natav, Name extends Names<N>> = DriverFor<ConfigsOf<N>, Name>;
  export type State<N extends Natav, Name extends Names<N>> = StateFor<ConfigsOf<N>, Name>;
  export type Api<N extends Natav, Name extends Names<N>> = ApiFor<ConfigsOf<N>, Name>;
  export type Deps<N extends Natav, Name extends Names<N>> = DepsOf<ConfigsOf<N>, Name>;
  export type DepNames<N extends Natav, Name extends Names<N>> = DepNamesOf<ConfigsOf<N>, Name>;
  export type Dep<
    N extends Natav,
    Name extends Names<N>,
    DepName extends DepNames<N, Name>,
  > = DepFor<ConfigsOf<N>, Name, DepName>;
  export type DepState<
    N extends Natav,
    Name extends Names<N>,
    DepName extends DepNames<N, Name>,
  > = Dep<N, Name, DepName>["state"];
  export type DepApi<N extends Natav, Name extends Names<N>, DepName extends DepNames<N, Name>> = {
    [M in keyof Dep<N, Name, DepName>["api"]]: Dep<N, Name, DepName>["api"][M] extends (
      (...args: infer Args) => infer R
    ) ?
      (...args: Args) => Promise<Awaited<R>>
    : never;
  };
  export type Handle<N extends Natav, Name extends Names<N>> = DriverHandle<
    DriverFor<ConfigsOf<N>, Name>
  >;
}

export default Natav;
