import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schema } from "./data.ts";

describe("schema fixture", () => {
  it("resolves nested object properties and api methods", async () => {
    const payload = await schema.response().json();

    const driver = payload.properties.configs.type.items[0];
    const api = driver.properties.api.type;
    const state = driver.properties.state.type;

    assert.equal(api.kind, "object");
    assert.equal(api.methods.ping.returns.kind, "primitive");
    assert.equal(api.methods.ping.returns.type, "string");
    assert.equal(api.methods.move.params[0].type.kind, "object");
    assert.equal(api.methods.move.params[0].type.properties.x.type.kind, "primitive");
    assert.equal(api.methods.move.params[1].type.kind, "object");
    assert.equal(api.methods.move.params[1].type.properties.smooth.type.kind, "primitive");
    assert.equal(api.methods.updateProfile.params[0].type.kind, "object");
    assert.equal(api.methods.updateProfile.params[0].type.properties.primary.type.kind, "object");
    assert.equal(api.methods.updateProfile.returns.kind, "object");
    assert.equal(api.methods.updateProfile.returns.properties.ok.type.kind, "literal");

    assert.equal(state.kind, "object");
    assert.equal(state.properties.profile.type.kind, "object");
    assert.equal(state.properties.profile.type.properties.primary.type.kind, "object");
    assert.equal(state.properties.profile.type.properties.origin.type.kind, "union");
    assert.equal(state.properties.history.type.kind, "array");
    assert.equal(state.properties.history.type.items.kind, "object");
  });
});
