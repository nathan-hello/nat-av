import { bus } from "@av/bus";
import type { Events } from "@av/types";

export class AutomationEngine {
  constructor() {
    bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(
    data: Events.System.Map["natav:state:update"],
  ): void {
    switch (data.name) {
      case "video-wall":
        break;
    }
  }
}
