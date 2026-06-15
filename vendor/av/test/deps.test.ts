import { Driver, Manager } from "@av/drivers";
import { ClientRpcDevice } from "@av/rpc/client/devices";
import type { Schema } from "@av/types";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

class Leaf<const N extends string> extends Driver<N> {
  state = { online: true };
  api = {};
  socket = undefined;

  schema = (): Schema.Schema<typeof this.api> => {
    return [];
  };

  constructor(name: N) {
    super({ name, driverName: "leaf" });
  }
}

class Parent<
  const N extends string,
  const D extends Record<string, Leaf<string>>,
> extends Driver<N, D, "parent", {}, { ready: boolean }> {
  state = { ready: true };
  api = {};
  socket = undefined;

  schema = (): Schema.Schema<typeof this.api> => {
    return [];
  };

  constructor(name: N, deps: D) {
    super({ name, driverName: "parent" });
    this.deps.set(deps);
  }
}

const child = new Leaf("child-1");
const parent = new Parent("parent-1", { [child.name]: child } as const);
const graph = new Manager({
  drivers: [parent] as const,
  deferred: [] as const,
});

describe("driver deps", () => {
  it("exposes named deps and lifts them into natav lookup", () => {
    assert.equal(parent.deps.get("child-1"), child);
    assert.equal(graph.GetDriver("child-1"), child);
    assert.deepEqual(graph.GetAllDriverNames(), ["parent-1", "child-1"]);
  });

  it("lets client handles navigate to lifted deps", () => {
    const marker = { name: "child-1" };
    const client = {
      device(name: string) {
        return { ...marker, name };
      },
      call() {},
      emitChange() {},
    };

    const device = new ClientRpcDevice<(typeof graph)["configs"], "parent-1">(
      // TSAS: we are just testing the child-1 being inside of device.deps
      client as any,
      "parent-1",
    );

    assert.deepEqual(device.deps.get("child-1"), { name: "child-1" });
  });
});
