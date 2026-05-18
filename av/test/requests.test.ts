import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RequestManager } from "../requests";
import { Telemetry } from "../telemetry";
import { TypedEventTarget } from "../lib/eventtarget";
import type { StreamDelimiter } from "../sockets/delimiters";
import type { DeviceSocket, SocketEventMap } from "../types";

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

const lineDelimiter: StreamDelimiter<string, string> = {
  format: (value) => Buffer.from(`${value}\n`, "utf8"),
  push: (chunk) =>
    chunk
      .toString("utf8")
      .split("\n")
      .filter((line) => line.length > 0),
};

const jsonLineDelimiter: StreamDelimiter<{ id: number; command: string }, { id: number; result: string }> =
  {
    format: (value) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
    push: (chunk) =>
      chunk
        .toString("utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line)),
  };

describe("requests", () => {
  it("queues serial requests when no matcher is provided", async () => {
    const socket = new FakeSocket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::Serial"),
      socket,
      delimiter: lineDelimiter,
      timeoutMs: 1000,
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

  it("matches responses out of order when a matcher is provided", async () => {
    const socket = new FakeSocket();
    const requests = new RequestManager<{ id: number; command: string }, { id: number; result: string }>({
      tel: new Telemetry("Test::Requests::Matched"),
      socket,
      delimiter: jsonLineDelimiter,
      timeoutMs: 1000,
      matchResponse: (request, response) => request.id === response.id,
    });

    const first = requests.request({ id: 1, command: "first" });
    const second = requests.request({ id: 2, command: "second" });

    assert.equal(socket.writes.length, 2);

    socket.receive(`${JSON.stringify({ id: 2, result: "two" })}\n`);
    socket.receive(`${JSON.stringify({ id: 1, result: "one" })}\n`);

    assert.deepEqual(await second, { ok: true, data: { id: 2, result: "two" } });
    assert.deepEqual(await first, { ok: true, data: { id: 1, result: "one" } });
  });

  it("emits unmatched messages", async () => {
    const socket = new FakeSocket();
    const requests = new RequestManager<string, string>({
      tel: new Telemetry("Test::Requests::Messages"),
      socket,
      delimiter: lineDelimiter,
      timeoutMs: 1000,
    });

    const message = requests.once("message");
    socket.receive("notification\n");

    assert.equal(await message, "notification");
  });
});
