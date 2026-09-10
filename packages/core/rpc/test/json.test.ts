import { Rpc } from "../types.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc json codecs", () => {
  it("round-trips a Map with numeric keys and object values", () => {
    const value = {
      devices: {
        "DEV-A": {
          name: "AMP-1",
          txChannels: new Map([
            [1, { number: 1, name: "tx01" }],
            [2, { number: 2, name: "tx02" }],
          ]),
        },
      },
    };

    assert.equal(Rpc.Json.is(value), true);

    const wire = Rpc.Json.stringify(value);
    const back = Rpc.Json.parse(wire) as typeof value;

    assert.equal(back.devices["DEV-A"].txChannels instanceof Map, true);
    assert.deepEqual(
      [...back.devices["DEV-A"].txChannels.entries()],
      [
        [1, { number: 1, name: "tx01" }],
        [2, { number: 2, name: "tx02" }],
      ],
    );
  });

  it("round-trips nested Maps (map of maps)", () => {
    const value = new Map([["outer", new Map([["inner", 1]])]]);

    const back = Rpc.Json.parse(Rpc.Json.stringify(value)) as Map<
      string,
      Map<string, number>
    >;

    assert.equal(back instanceof Map, true);
    assert.equal(back.get("outer") instanceof Map, true);
    assert.equal(back.get("outer")?.get("inner"), 1);
  });

  it("round-trips a Uint8Array to a Uint8Array", () => {
    const value = {
      name: "blob",
      data: new Uint8Array([0, 1, 127, 128, 255]),
    };

    assert.equal(Rpc.Json.is(value), true);

    const back = Rpc.Json.parse(Rpc.Json.stringify(value)) as typeof value;

    assert.equal(back.data instanceof Uint8Array, true);
    assert.deepEqual([...back.data], [0, 1, 127, 128, 255]);
  });

  it("treats a Node Buffer as a Uint8Array across the boundary", () => {
    const value = { data: Buffer.from([10, 20, 30]) };

    assert.equal(Rpc.Json.is(value), true);

    const back = Rpc.Json.parse(Rpc.Json.stringify(value)) as {
      data: Uint8Array;
    };

    assert.equal(back.data instanceof Uint8Array, true);
    assert.deepEqual([...back.data], [10, 20, 30]);
  });

  it("does not collide with plain objects that share the tag keys", () => {
    const value = {
      __rpc_t__: "not-a-real-tag",
      __rpc_v__: [1, 2, 3],
      extra: true,
    };

    assert.equal(Rpc.Json.is(value), true);

    const back = Rpc.Json.parse(Rpc.Json.stringify(value)) as typeof value;

    assert.deepEqual(back, value);
    assert.equal(back instanceof Map, false);
  });

  it("reports non-json values inside a Map as non-serializable", () => {
    const value = new Map<string, unknown>([["k", () => {}]]);
    assert.equal(Rpc.Json.is(value), false);
  });

  it("preserves plain arrays and nested structures alongside Maps", () => {
    const value = {
      matrix: { "DEV-A": { 1: { txDevice: "DEV-B", txChannelName: "tx01" } } },
      list: [1, "two", { three: 3 }],
      channels: new Map([[0, { name: "rx00" }]]),
    };

    const back = Rpc.Json.parse(Rpc.Json.stringify(value)) as typeof value;

    assert.deepEqual(back.matrix, value.matrix);
    assert.deepEqual(back.list, value.list);
    assert.equal(back.channels instanceof Map, true);
    assert.equal(back.channels.get(0)?.name, "rx00");
  });

  it("round-trips scoped RPC error responses", () => {
    const response: Rpc.Error.Response = {
      jsonrpc: "2.0",
      id: 4,
      error: {
        scope: "plugin",
        name: "schema",
        code: -32001,
        message: "plugin failed",
        data: { reason: "test" },
      },
    };

    const parsed = Rpc.Json.parse(Rpc.Json.stringify(response));
    const back = Rpc.Error.is(parsed);

    assert.equal(back?.origin.scope, "plugin");
    assert.equal(back?.origin.name, "schema");
    assert.equal(back?.id, 4);
    assert.deepEqual(back?.cause, {
      code: -32001,
      message: "plugin failed",
      data: { reason: "test" },
    });
  });

  it("preserves arbitrary thrown values as the cause", () => {
    const cause = { reason: "test", retryable: true };
    const error = new Rpc.Error(cause, { scope: "driver", name: "camera" }, 4);

    assert.equal(error.message, "RPC error");
    assert.equal(error.origin.scope, "driver");
    assert.equal(error.origin.name, "camera");
    assert.equal(error.id, 4);
    assert.equal(error.cause, cause);
  });
});
