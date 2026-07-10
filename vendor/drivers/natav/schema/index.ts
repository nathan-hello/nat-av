import fs from "node:fs";
import { Err } from "@av/client";
import { Driver } from "@av/drivers";
import { type Drivers } from "@av/index";

type SchemaState = Record<string, readonly unknown[]>;

function loadState(): SchemaState {
  const output = new URL("./output/", import.meta.url);
  // TSAS: state.json is written by the schema generator as a string-to-string map.
  const manifest = JSON.parse(fs.readFileSync(new URL("state.json", output), "utf8")) as Record<
    string,
    string
  >;
  return Object.fromEntries(
    Object.entries(manifest).map(([name, filename]) => {
        const contents = fs.readFileSync(new URL(filename, output), "utf8");
        return [name, JSON.parse(contents)];
      }),
  );
}

export class SchemaGenerator extends Driver<"schema"> {
  natav: Drivers.ManagerView;
  state: SchemaState = loadState();

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
