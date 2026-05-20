import type { natav } from "@av/index";
import type Natav from "./natav";
import type { ApiSurfaceSchema } from "@av/schema/types";

export type SystemStateData = null;

export class System<N extends Natav = natav> {
  private natav: N;
  private schema: ApiSurfaceSchema;

  constructor(args: { natav: N; schema: ApiSurfaceSchema }) {
    this.schema = args.schema;
    this.natav = args.natav;
  }

  api = {
    GetSchema: () => {
      return this.schema;
    },
  };

  get state(): SystemStateData {
    return null;
  }
}
