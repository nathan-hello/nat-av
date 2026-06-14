import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { natav } from "./data.ts";

describe("test natav", () => {
  it("registers the shim driver", () => {
    assert.deepEqual(natav.GetAllDriverNames(), ["shim-1"]);
    assert.equal(natav.GetDriver("shim-1").name, "shim-1");
  });
});
