import type { natav } from "@av/index";
import { type Bus } from "./bus";
import type Natav from "./natav";
import type { ApiSurfaceSchema } from "@av/schema/types";

export class System<N extends Natav = natav> {
  private state: Record<string, any>;
  private bus: Bus;
  private natav: N;
  private schema: ApiSurfaceSchema;

  constructor(args: { bus: Bus; natav: N; schema: ApiSurfaceSchema }) {
    this.schema = args.schema;
    this.bus = args.bus;
    this.natav = args.natav;
    this.state = {};
  }

  api = {
    GetSchema: (): ApiSurfaceSchema => {
      return this.schema;
    },
    GetSystemState: () => {
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
