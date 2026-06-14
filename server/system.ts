import { Driver, type Manager } from "@av/drivers";
import type { Drivers } from "@av/types";
import type { drivers } from "@server/index";
import { AutomationEngine } from "@server/lib/automation";

// This is the System class. It is not a socket-less driver because if
// this were to be managed by the Natav.Orch Orchistrator, then we would
// have a circular type definition. We want the implementation of Natav.Orch
// to be accessible to this class for custom work.

export class System<const N extends string> extends Driver<N> {
  private natav: Manager<drivers>;
  socket = undefined;
  schema = undefined;

  constructor(args: { name: N; natav: Manager<drivers> }) {
    super({ name: args.name, driverName: "system" });
    this.natav = args.natav;
    new AutomationEngine();
    type good = Drivers.FromName<drivers, "video-wall">;
    const bad = this.natav.GetDriver("decoder-1");
    bad.api.route;
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
    return {};
  }
}
