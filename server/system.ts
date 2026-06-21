import { Driver } from "@av/drivers";
import type { Drivers } from "@av/types";
import type { drivers } from "@server/index";

type State = {
  ui: {
    mode: "vtc" | "local" | "off";
    page: "home" | "vtc" | "local" | "tv";
  };
};

export class System extends Driver<"system"> {
  private natav: Drivers.ManagerView<drivers>;

  constructor(natav: Drivers.ManagerView<drivers>) {
    super({ name: "system" });
    this.natav = natav;
  }

  public override async start() {}

  api = {
    asdf: () => {
      return null;
    },
    fdsa: () => {
      return null;
    },
  };

  get state() {
    return {};
  }
}
