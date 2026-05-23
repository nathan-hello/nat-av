import type { natav } from "@av/index";
import type { Natav } from "@av/types";

export type SystemStateData = null;

export class System<N extends Natav.Orch = natav> {
  private natav: N;

  constructor(args: { natav: N }) {
    this.natav = args.natav;
  }

  api = {};

  get state(): SystemStateData {
    return null;
  }
}
