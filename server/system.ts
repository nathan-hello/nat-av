import { Driver } from "@av/drivers";
import type { Drivers } from "@av/types";
import type { drivers } from "@server/index";
import { AutomationEngine } from "@server/lib/automation";

export class System extends Driver<"system"> {
  private natav: Drivers.ManagerView<drivers>;
  socket = undefined;
  schema = undefined;

  constructor(natav: Drivers.ManagerView<drivers>) {
    super({ name: "system" });
    this.natav = natav;
    new AutomationEngine(natav);
    type good = Drivers.FromName<drivers, "video-wall">;
    const shouldwork1 = this.natav.GetDriver("video-wall");
    const shouldwork2 = this.natav.GetDriver("decoder-1");
  }

  public override async start() {}

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
