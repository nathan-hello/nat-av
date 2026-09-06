import { Driver, type Drivers } from "@nat-av/core";

type SystemPage = "wall" | "dante" | "debug" | "paint" | "relays" | "off";

type SystemState = {
  ui: {
    page: SystemPage;
  };
};

export class System extends Driver<
  "system",
  SystemState
> {
  constructor(_manager: Drivers.ManagerView) {
    super({ name: "system" });
  }

  api = {
    route: (page: SystemPage) => {
      this.state.ui.page = page;
      this.dispatch("driver:state-updated", { data: this.state });
    },
  };

  state: SystemState = {
    ui: { page: "off" },
  };
}
