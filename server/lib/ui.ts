import { Driver } from "@av/drivers";

export class Controller extends Driver<"ui"> {
  state = {};
  api = {};
  constructor() {
    super({ name: "ui", driverName: "controller" });
  }
}
