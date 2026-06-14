import type { Manager } from "@av/drivers";
import type { natav } from "@av/index";
import { AutomationEngine } from "@av/system/automation";
import type { Drivers } from "@av/types";

// This is the System class. It is not a socket-less driver because if
// this were to be managed by the Natav.Orch Orchistrator, then we would
// have a circular type definition. We want the implementation of Natav.Orch
// to be accessible to this class for custom work.
export class System {
  private natav: Manager<natav>;

  constructor(args: { natav: Manager<natav> }) {
    this.natav = args.natav;
    new AutomationEngine();
    type good = Drivers.FromName<natav, "video-wall">;
    const bad = this.natav.GetDriver("ChazyControl");
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
