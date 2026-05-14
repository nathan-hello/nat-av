import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schema } from "./data.ts";

describe("test schema", () => {
  it("generates the natav schema for the test graph", async () => {
    const payload = await schema.response().json();

    assert.equal(payload.version, 1);
    assert.deepEqual(payload.entry, {
      filePath: "/home/nate/code/nat-av/av/test/data.ts",
      exportName: "natav",
    });
    assert.equal(payload.typeName, "Natav");
    assert.deepEqual(payload.source, {
      filePath: "/home/nate/code/nat-av/av/natav.ts",
      symbolName: "Natav",
    });
    assert.equal(payload.properties.configs.type.kind, "tuple");
    assert.equal(payload.methods.GetDriver.params[0].name, "name");
    assert.equal(payload.methods.GetAllDriverNames.returns.kind, "array");
  });
});
