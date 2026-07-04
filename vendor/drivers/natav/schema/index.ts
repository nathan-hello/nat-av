import { Err } from "@av/client";
import { Driver } from "@av/drivers";
import { type Drivers } from "@av/index";
import { state } from "@drivers/natav/schema/output/state";

type SchemaState = Record<string, readonly unknown[]>;

export class SchemaGenerator extends Driver<"schema"> {
  natav: Drivers.ManagerView;
  state: SchemaState = state;

  api = {
    get: (name: string): readonly unknown[] => {
      if (typeof name !== "string") {
        throw new Error("schema.get requires a string driver name", {
          cause: Err.Codes.RpcInvalidParams,
        });
      }
      const found = this.state[name];
      if (!found) {
        throw new Error(`no schema for driver "${name}"`, {
          cause: Err.Codes.DriverNotFound,
        });
      }
      return found;
    },
    names: (): string[] => {
      return Object.keys(this.state);
    },
    all: (): SchemaState => {
      return this.state;
    },
  };

  constructor(natav: Drivers.ManagerView) {
    super({ name: "schema" });
    this.natav = natav;
  }
}
