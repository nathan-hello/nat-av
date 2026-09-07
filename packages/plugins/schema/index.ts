import { Err, Driver } from "@nat-av/core";
import { type Drivers } from "@nat-av/core";

export type SchemaState = Record<string, readonly unknown[]>;

export default class SchemaGenerator extends Driver<"schema"> {
  natav: Drivers.ManagerView;
  state: SchemaState;

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

  constructor(natav: Drivers.ManagerView, state: SchemaState) {
    super({ name: "schema" });
    this.natav = natav;
    this.state = state;
  }
}
