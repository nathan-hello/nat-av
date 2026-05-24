import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { driver } from "./data.ts";

describe("test driver", () => {
  it("exposes the shim driver state and api", () => {
    assert.equal(driver.name, "shim-1");
    assert.equal(driver._drivername, "test-shim");
    assert.equal(driver.state.connected, false);
    assert.equal(driver.state.lastFrame, "");
    assert.equal(typeof driver.api.ping, "function");
    assert.equal(typeof driver.api.send, "function");
    assert.equal(driver.socket.name, "TcpClient::127.0.0.1:12345");
  });
});
