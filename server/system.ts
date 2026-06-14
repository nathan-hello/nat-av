import { Driver } from "@av/drivers";
import type { Drivers } from "@av/types";
import type { drivers, systemDrivers } from "@server/index";
import { AutomationEngine } from "@server/lib/automation";

// This is the System class. It is not a socket-less driver because if
// this were to be managed by the Natav.Orch Orchistrator, then we would
// have a circular type definition. We want the implementation of Natav.Orch
// to be accessible to this class for custom work.

export class System extends Driver<"system"> {
  private natav: Drivers.ManagerView<systemDrivers>;
  socket = undefined;
  schema = undefined;

  constructor(natav: Drivers.ManagerView<systemDrivers>) {
    super({ name: "system", driverName: "system" });
    this.natav = natav;
    new AutomationEngine(natav);
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
