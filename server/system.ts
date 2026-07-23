import { Driver } from "@av/drivers";
import type { Drivers } from "@av/types";

type State = {
  ui: {
    page: "wall" | "dante" | "debug" | "paint" | "relays" | "off";
  };
};

export class System extends Driver<"system"> {
  private natav: Drivers.ManagerView;

  constructor(natav: Drivers.ManagerView) {
    super({ name: "system" });
    this.natav = natav;
    this.api.route.bind(this);
  }

  public override async start() {}

  api = {
    route: (p: State["ui"]["page"]) => {
      this.state.ui.page = p;
      this.dispatch("driver:state-updated", { data: this.state });
    },
  };

  state: State = {
    ui: { page: "off" },
  };
}
