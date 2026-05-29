import type { DriverFor, Natav } from "@av/types";
import type { natav } from "@av/index";
import { AutomationEngine } from "@av/system/automation";

// This is the System class. It is not a socket-less driver because if
// this were to be managed by the Natav.Orch Orchistrator, then we would
// have a circular type definition. We want the implementation of Natav.Orch
// to be accessible to this class for custom work.
export class System<N extends Natav.Orch = natav> {
  private natav: N;

  constructor(args: { natav: N }) {
    this.natav = args.natav;
    new AutomationEngine();
    type good = DriverFor<natav["configs"], "video-wall">;
    const bad = this.natav.GetDriver("video-wall");
  }

  api = {
    asdf: () => {
      return null;
    },
    fdsa: () => {
      return null;
    },
  };

  get state() {
    return null;
  }
}
