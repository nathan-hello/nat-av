import { RequestManager } from "@av/lib/requests";
import { Delimiters } from "@av/sockets/delimiters";
import { Telemetry } from "@av/telemetry";
import { Test } from "@av/test/data.test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

describe("requests", () => {
  it("queues serial requests when no matcher is provided", async () => {
    const socket = new Test.Socket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::Serial"),
      socket,
      delimiter: Delimiters.characterDelimted("\n", false),
      formatter: (str) => {
        if (str.at(-1) !== "\n") {
          str += "\n";
        }

        return Buffer.from(str, "utf8");
      },
      timeoutMs: 1000,
    });

    const first = requests.request("one");
    const second = requests.request("two");
    const third = requests.request("third\n");

    assert.equal(socket.writes.length, 1);
    assert.equal(socket.writes[0]?.toString(), "one\n");

    socket.receive("first\n");
    assert.deepEqual(await first, { ok: true, data: "first" });

    assert.equal(socket.writes.length, 2);
    assert.equal(socket.writes[1]?.toString("utf8"), "two\n");

    socket.receive("second\n");
    assert.deepEqual(await second, { ok: true, data: "second" });

    assert.equal(socket.writes.length, 3);
    assert.equal(socket.writes[2]?.toString("utf8"), "third\n");

    socket.receive("third\n");
    assert.deepEqual(await third, { ok: true, data: "third" });
  });

  it("matches responses out of order when a matcher is provided", async () => {
    const socket = new Test.Socket();
    const requests = new RequestManager<
      { id: number; command: string },
      { id: number; result: string }
    >({
      tel: new Telemetry("Test::Requests::Matched"),
      socket,
      delimiter: (buffer) => {
        const newline = Delimiters.characterDelimted("\n", false)(buffer);
        if (!newline) {
          return null;
        }
        const msgs: { id: number; result: string }[] = [];
        for (const line of newline) {
          msgs.push(JSON.parse(line));
        }
        return msgs;
      },
      timeoutMs: 1000,
      responseStrategy: {
        strategy: "match",
        matchFn: (request, response) => request.id === response.id,
      },
    });

    const first = requests.request({ id: 1, command: "first" });
    const second = requests.request({ id: 2, command: "second" });

    assert.equal(socket.writes.length, 2);

    socket.receive(`${JSON.stringify({ id: 2, result: "two" })}\n`);
    socket.receive(`${JSON.stringify({ id: 1, result: "one" })}\n`);

    assert.deepEqual(await second, {
      ok: true,
      data: { id: 2, result: "two" },
    });
    assert.deepEqual(await first, { ok: true, data: { id: 1, result: "one" } });
  });

  it("paces matched requests without dropping queued work", async () => {
    const socket = new Test.Socket();
    const requests = new RequestManager<
      { id: number; command: string },
      { id: number; result: string }
    >({
      tel: new Telemetry("Test::Requests::MatchedPaced"),
      socket,
      delimiter: (buffer) => {
        const newline = Delimiters.characterDelimted("\n", false)(buffer);
        if (!newline) {
          return null;
        }
        const msgs: { id: number; result: string }[] = [];
        for (const line of newline) {
          msgs.push(JSON.parse(line));
        }
        return msgs;
      },
      formatter: (message) =>
        Buffer.from(`${JSON.stringify(message)}\n`, "utf8"),
      timeoutMs: 1000,
      responseStrategy: {
        strategy: "match",
        matchFn: (request, response) => request.id === response.id,
        maxInFlight: 1,
        minGapMs: 20,
      },
    });

    const first = requests.request({ id: 1, command: "first" });
    const second = requests.request({ id: 2, command: "second" });

    assert.equal(socket.writes.length, 1);
    assert.match(socket.writes[0].toString("utf8"), /"id":1/);

    socket.receive(`${JSON.stringify({ id: 1, result: "one" })}\n`);
    assert.deepEqual(await first, { ok: true, data: { id: 1, result: "one" } });

    assert.equal(socket.writes.length, 1);

    await delay(25);

    assert.equal(socket.writes.length, 2);
    assert.match(socket.writes[1]!.toString("utf8"), /"id":2/);

    socket.receive(`${JSON.stringify({ id: 2, result: "two" })}\n`);
    assert.deepEqual(await second, {
      ok: true,
      data: { id: 2, result: "two" },
    });
  });

  it("blocks later requests until earlier responses arrive in blocking queue mode", async () => {
    const socket = new Test.Socket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::BlockingQueue"),
      socket,
      delimiter: Delimiters.characterDelimted("\n", false),
      formatter: (str) => {
        if (str.at(-1) !== "\n") {
          str += "\n";
        }

        return Buffer.from(str, "utf8");
      },
      timeoutMs: 1000,
      responseStrategy: { strategy: "blocking-queue" },
    });

    const first = requests.request("one");
    const second = requests.request("two");

    assert.equal(socket.writes.length, 1);
    assert.equal(socket.writes[0]?.toString("utf8"), "one\n");

    socket.receive("first\n");
    assert.deepEqual(await first, { ok: true, data: "first" });

    assert.equal(socket.writes.length, 2);
    assert.equal(socket.writes[1]?.toString("utf8"), "two\n");

    socket.receive("second\n");
    assert.deepEqual(await second, { ok: true, data: "second" });
  });

  it("emits unmatched messages", async () => {
    const socket = new Test.Socket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::Messages"),
      socket,
      delimiter: Delimiters.characterDelimted("\n", false),
      timeoutMs: 1000,
    });

    const message = requests.once("delimited");
    socket.receive("notification\n");

    assert.equal(await message, "notification");
  });

  it("rejects pending requests and resets delimiter on disconnect", async () => {
    const socket = new Test.Socket();
    const tel = new Telemetry("Test::Requests::Disconnect");
    const { delimiter, formatter } = Delimiters.lengthPrefixedJson<
      { id: number; command: string },
      { id: number; result: string }
    >(tel);

    const requests = new RequestManager({
      tel,
      socket,
      formatter,
      delimiter,
      timeoutMs: 5000,
      responseStrategy: {
        strategy: "match",
        matchFn: (req, res) => req.id === res.id,
      },
    });

    const pending = requests.request({ id: 1, command: "stuck" });

    // Simulate a partial frame sitting in the delimiter buffer
    const partial = Buffer.alloc(4);
    partial.writeUInt32BE(999, 0); // length prefix claiming 999 bytes
    partial.write("xx", 4); // only 2 bytes of payload
    socket.receive(partial);

    // Fire disconnect — should reject pending and clear the stale buffer
    socket.dispatch("disconnected", { error: "socket closed" });

    const result = await pending;
    assert.equal(result.ok, false);
    assert.match(result.error!.message, /socket disconnected/);

    // After reconnect, a fresh valid frame should parse cleanly
    // (stale partial data must not corrupt the new stream)
    const valid = formatter({ id: 2, command: "after-reconnect" });
    const responseFrame = formatter({ id: 2, result: "ok" } as any);
    const next = requests.request({ id: 2, command: "after-reconnect" });

    socket.dispatch("connected", undefined);
    socket.receive(responseFrame);

    const matched = await next;
    assert.deepEqual(matched, { ok: true, data: { id: 2, result: "ok" } });

    requests.end();
  });
});

describe("delimiters", () => {
  it("lengthPrefixedJson continues past a malformed frame without losing subsequent valid frames", () => {
    const tel = new Telemetry("Test::Delimiters::Malformed");
    const { delimiter, formatter } = Delimiters.lengthPrefixedJson<
      { id: number },
      { id: number; result: string }
    >(tel);

    const good1 = formatter({ id: 1 });
    const good1Response = formatter({ id: 1, result: "a" } as any);
    const good2Response = formatter({ id: 2, result: "b" } as any);

    // Build a bad frame: correct 4-byte length prefix but garbage payload
    const badPayload = Buffer.from("NOT-JSON", "utf8");
    const badFrame = Buffer.alloc(4 + badPayload.length);
    badFrame.writeUInt32BE(badPayload.length, 0);
    badPayload.copy(badFrame, 4);

    // Concatenate: good response, bad frame, good response
    const combined = Buffer.concat([good1Response, badFrame, good2Response]);
    const results = delimiter(combined);

    assert.equal(results?.length, 2);
    assert.deepEqual(results![0], { id: 1, result: "a" });
    assert.deepEqual(results![1], { id: 2, result: "b" });

    // good1 (a request, not a response) was just used to build the buffer,
    // not passed through the delimiter — verify delimiter is stateless-ish
    void good1;
  });

  it("lengthPrefixedJson reset clears stale partial data", () => {
    const tel = new Telemetry("Test::Delimiters::Reset");
    const { delimiter, formatter } = Delimiters.lengthPrefixedJson<
      { id: number },
      { id: number; result: string }
    >(tel);

    // Feed a partial frame (incomplete)
    const partial = Buffer.alloc(4);
    partial.writeUInt32BE(100, 0); // claims 100 bytes
    const result1 = delimiter(partial);
    assert.deepEqual(result1, []); // not enough data yet

    // Reset should clear the stale partial
    delimiter.reset!();

    // Now feed a complete valid frame — it should parse cleanly
    const valid = formatter({ id: 1, result: "fresh" } as any);
    const result2 = delimiter(valid);
    assert.equal(result2?.length, 1);
    assert.deepEqual(result2![0], { id: 1, result: "fresh" });
  });
});
