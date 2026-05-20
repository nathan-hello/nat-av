import type { natav } from "@av/index";
import type Natav from "./natav";

export type SystemStateData = null;

export class System<N extends Natav = natav> {
  private natav: N;

  constructor(args: { natav: N }) {
    this.natav = args.natav;
  }

  api = {};

  get state(): SystemStateData {
    return null;
  }
}
