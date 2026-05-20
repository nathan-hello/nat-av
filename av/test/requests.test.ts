import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { RequestManager } from "../requests";
import { Telemetry } from "../telemetry";
import { TypedEventTarget } from "../lib/eventtarget";
import type { DeviceSocket, SocketEventMap } from "../types";
import { Delimiters } from "@av/sockets/delimiters";

class FakeSocket extends TypedEventTarget<SocketEventMap> implements DeviceSocket {
  name = "fake-socket";
  writes: Buffer[] = [];

  start() {}
  end() {}

  write(data: string | Uint8Array | Buffer) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.writes.push(buffer);
    return buffer.length;
  }

  receive(data: string | Buffer) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    this.dispatch("receive", buffer);
  }
}

describe("requests", () => {
  it("queues serial requests when no matcher is provided", async () => {
    const socket = new FakeSocket();
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
    assert.equal(socket.writes[0]?.toString("utf8"), "one\n");

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
    const socket = new FakeSocket();
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

    assert.deepEqual(await second, { ok: true, data: { id: 2, result: "two" } });
    assert.deepEqual(await first, { ok: true, data: { id: 1, result: "one" } });
  });

  it("paces matched requests without dropping queued work", async () => {
    const socket = new FakeSocket();
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
      formatter: (message) => Buffer.from(`${JSON.stringify(message)}\n`, "utf8"),
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
    assert.match(socket.writes[0]!.toString("utf8"), /"id":1/);

    socket.receive(`${JSON.stringify({ id: 1, result: "one" })}\n`);
    assert.deepEqual(await first, { ok: true, data: { id: 1, result: "one" } });

    assert.equal(socket.writes.length, 1);

    await delay(25);

    assert.equal(socket.writes.length, 2);
    assert.match(socket.writes[1]!.toString("utf8"), /"id":2/);

    socket.receive(`${JSON.stringify({ id: 2, result: "two" })}\n`);
    assert.deepEqual(await second, { ok: true, data: { id: 2, result: "two" } });
  });

  it("blocks later requests until earlier responses arrive in blocking queue mode", async () => {
    const socket = new FakeSocket();
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
    const socket = new FakeSocket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::Messages"),
      socket,
      delimiter: Delimiters.characterDelimted("\n", false),
      timeoutMs: 1000,
    });

    const message = requests.once("message");
    socket.receive("notification\n");

    assert.equal(await message, "notification");
  });
});
