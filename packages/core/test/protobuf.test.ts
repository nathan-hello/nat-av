import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Delimiters } from "../sockets/delimiters/index.js";

type Message = { value: string };

const textCodec = {
  encode: (message: Message) => Buffer.from(message.value, "utf8"),
  decode: (payload: Uint8Array): Message => ({
    value: Buffer.from(payload).toString("utf8"),
  }),
};

describe("protobuf framing", () => {
  it("buffers partial frames and decodes combined frames", () => {
    const { delimiter, formatter } =
      Delimiters.protobuf.lengthPrefixed32BE(textCodec);
    const first = formatter({ value: "first" });
    const second = formatter({ value: "second" });

    assert.equal(delimiter(first.subarray(0, 3)), null);
    assert.deepEqual(delimiter(Buffer.concat([first.subarray(3), second])), [
      { value: "first" },
      { value: "second" },
    ]);
  });

  it("resets partial data", () => {
    const { delimiter, formatter } =
      Delimiters.protobuf.lengthPrefixed32BE(textCodec);
    const stale = formatter({ value: "stale" });
    const fresh = formatter({ value: "fresh" });

    assert.equal(delimiter(stale.subarray(0, 6)), null);
    delimiter.reset?.();
    assert.deepEqual(delimiter(fresh), [{ value: "fresh" }]);
  });

  it("rejects inbound and outbound payloads above the limit", () => {
    const { delimiter, formatter } = Delimiters.protobuf.lengthPrefixed32BE({
      ...textCodec,
      maxPayloadBytes: 4,
    });

    assert.throws(() => formatter({ value: "12345" }), /outside 0\.\.4/);

    const header = Buffer.alloc(4);
    header.writeUInt32BE(5, 0);
    assert.throws(() => delimiter(header), /outside 0\.\.4/);
  });

  it("allows empty protobuf payloads unless the protocol forbids them", () => {
    const { formatter } = Delimiters.protobuf.lengthPrefixed32BE({
      encode: () => new Uint8Array(),
      decode: () => ({}),
    });
    assert.equal(formatter({}).readUInt32BE(0), 0);

    const nonEmpty = Delimiters.protobuf.lengthPrefixed32BE({
      encode: () => new Uint8Array(),
      decode: () => ({}),
      minPayloadBytes: 1,
    });
    assert.throws(() => nonEmpty.formatter({}), /outside 1\.\./);
  });
});
