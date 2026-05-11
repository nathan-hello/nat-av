import type { natav } from "@av/index";
import { type SystemEvent, type Bus } from "./bus";
import type Natav from "@av/natav";

export class AutomationEngine<N extends Natav = natav> {
  private bus: Bus;
  private natav: N;

  constructor(args: { bus: Bus; natav: N }) {
    this.bus = args.bus;
    this.natav = args.natav;
    this.bus.on("natav:state:update", (update) => {
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
