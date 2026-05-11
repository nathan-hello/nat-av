import type { natav } from "@av/index";
import { type Bus } from "./bus";
import type Natav from "./natav";

export class System<N extends Natav = natav> {
  private state: SystemState;
  private bus: Bus;
  private natav: N;

  constructor(args: { bus: Bus; natav: N }) {
    this.bus = args.bus;
    this.natav = args.natav;
    this.state = new SystemState({ bus: this.bus });
  }

  api = {
    GetSystemState: (): SystemStateData => {
      return this.state.toJSON();
    },

    GetDeviceState: <Name extends Natav.Names<N>>(name: Name): Natav.State<N, Name> => {
      return this.natav.GetDriverState(name);
    },

    GetAllDeviceStates: (): {
      [Name in Natav.Names<N>]: Natav.State<N, Name>;
    } => {
      return Object.fromEntries(this.natav.configs.map((d) => [d.name, d.state])) as {
        [Name in Natav.Names<N>]: Natav.State<N, Name>;
      };
    },
  };
}

type SystemStateData = {
  connections: Record<string, { connected: boolean }>;
};

class SystemState {
  private connections: Record<string, { connected: boolean }> = {};
  private bus: Bus;

  constructor(args: { bus: Bus }) {
    this.bus = args.bus;
    this.bus.on("natav:device:connected", (payload) => {
      this.connections[payload.name] = { connected: true };
    });

    this.bus.on("natav:device:disconnected", (payload) => {
      this.connections[payload.name] = { connected: false };
    });

    this.bus.on("natav:state:update", () => {});
  }

  toJSON(): SystemStateData {
    return {
      connections: this.connections,
    };
  }
}
