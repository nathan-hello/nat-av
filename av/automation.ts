import type { natav } from "@av/index";
import { type SystemEvent, bus } from "@av/bus";
import type Natav from "@av/natav";

export class AutomationEngine<N extends Natav = natav> {
  private natav: N;

  constructor(args: { natav: N }) {
    this.natav = args.natav;
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
