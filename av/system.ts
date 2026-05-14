import type { natav } from "@av/index";
import { type Bus } from "./bus";
import type Natav from "./natav";
import type { ApiSurfaceSchema } from "@av/schema/types";

export type SystemStateData = null;

export class System<N extends Natav = natav> {
  private bus: Bus;
  private natav: N;
  private schema: ApiSurfaceSchema;

  constructor(args: { bus: Bus; natav: N; schema: ApiSurfaceSchema }) {
    this.schema = args.schema;
    this.bus = args.bus;
    this.natav = args.natav;
  }

  api = {
    GetSchema: (): ApiSurfaceSchema => {
      return this.schema;
    },
  };

  get state(): SystemStateData {
    return null
  }
}

