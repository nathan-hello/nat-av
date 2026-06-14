import type { Bus } from "@av/lib/bus";
import type { Events } from "@av/types";
import type { natav } from "@server/index";

export class AutomationEngine {
  constructor(private bus: Bus<natav>) {
    this.bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(
    data: Events.Natav.Map<natav>["natav:state:update"],
  ): void {
    switch (data.name) {
      case "video-wall":
        break;
    }
  }
}
