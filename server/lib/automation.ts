import type { Drivers, Events } from "@av/types";
import type { drivers } from "@server/index";

export class AutomationEngine {
  constructor(private natav: Drivers.ManagerView<drivers>) {
    this.natav.bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(
    data: Events.Natav.Map<drivers>["natav:state:update"],
  ): void {
    switch (data.name) {
      case "video-wall":
        break;
    }
  }
}
