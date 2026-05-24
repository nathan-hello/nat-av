import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Driver } from "../driver";
import { ClientRpcDevice } from "../rpc/client/devices";
import type { Schema } from "@av/types";
import { Orchistrator } from "@av/natav";

class Leaf<const N extends string> extends Driver<
  N,
  {},
  "leaf",
  {},
  { online: boolean },
  undefined
> {
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
> extends Driver<N, D, "parent", {}, { ready: boolean }, undefined> {
  state = { ready: true };
  api = {};
  socket = undefined;

  schema = (): Schema.Schema<typeof this.api> => {
    return [];
  };

  constructor(name: N, deps: D) {
    super({ name, driverName: "parent" });
    this.deps = deps;
  }
}

const child = new Leaf("child-1");
const parent = new Parent("parent-1", { [child.name]: child } as const);
const graph = new Orchistrator([parent] as const);

describe("driver deps", () => {
  it("exposes named deps and lifts them into natav lookup", () => {
    assert.equal(parent.dep("child-1"), child);
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

    // TSAS:
    const device = new ClientRpcDevice<typeof graph, "parent-1">(
      client as any,
      "parent-1",
    );

    assert.deepEqual(device.dep("child-1"), { name: "child-1" });
  });
});
