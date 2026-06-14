import type { Drivers, Events } from "@av/types";
import type { systemDrivers } from "@server/index";

export class AutomationEngine {
  constructor(private natav: Drivers.ManagerView<systemDrivers>) {
    this.natav.bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(
    data: Events.Natav.Map<systemDrivers>["natav:state:update"],
  ): void {
    switch (data.name) {
      case "video-wall":
        break;
    }
  }
}
