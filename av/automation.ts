import { type SystemEvent, bus } from "@av/bus";

export class AutomationEngine {
  constructor() {
    bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(data: SystemEvent<"natav:state:update">): void {
    switch (data.name) {
      case "video-wall":
        break;
    }
  }
}
