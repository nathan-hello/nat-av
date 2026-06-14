import type { natav } from "@av/index";
import { bus } from "@av/lib/bus";
import type { Events } from "@av/types";

export class AutomationEngine {
  constructor() {
    bus.on("natav:state:update", (update) => {
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
