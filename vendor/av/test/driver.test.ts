import { Manager } from "@av/drivers";
import { Test } from "@av/test/data.test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("test driver", () => {
  const driver = new Test.Driver({
    name: "shim-1",
    socket: new Test.Socket(),
  });

  const natav = new Manager({ drivers: [driver], deferred: [] });

  it("registers the shim driver", () => {
    assert.deepEqual(natav.GetAllDriverNames(), ["shim-1"]);
    assert.equal(natav.GetDriver("shim-1").name, "shim-1");
  });

  it("exposes the shim driver state and api", () => {
    assert.equal(driver.name, "shim-1");
    assert.equal(driver.state.connected, false);
    assert.equal(driver.state.lastFrame, "init");
    assert.equal(typeof driver.api.ping, "function");
    assert.equal(typeof driver.api.send, "function");
    assert.equal(driver.socket.name, "test-socket");
  });
});
