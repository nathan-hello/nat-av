import { Test } from "../../test/data.test.js";
import { ClientRpcRequests } from "../client/requests.js";
import { Natav } from "../../drivers/index.js";
import { RpcServer } from "../server/index.js";
import { Rpc } from "../types.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc errors", () => {
  it("rejects every pending request when the transport closes", async () => {
    const transport = new Test.RpcTransport();
    const requests = new ClientRpcRequests(transport, () => {});

    const pending = requests.request(
      Rpc.Request.driverCall(0, {
        driver: "missing",
        method: "ping",
        args: [],
      }),
    );
    transport.connect();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const error = new Rpc.Error(
      { code: -32005, message: "closed" },
      { scope: "client" },
      null,
    );
    requests.rejectAll(error);

    await assert.rejects(pending, (received: unknown) => received === error);
  });

  it("preserves the numeric request id in malformed request errors", async () => {
    const transport = new Test.RpcTransport();
    const natav = new Natav({
      drivers: [],
      plugin: [(n) => new RpcServer(n, transport.server)],
    });
    void natav;

    const peer = {
      addr: "test",
      readyState: 1,
      send(message: string) {
        const parsed = Rpc.Json.parse(message);
        assert.equal(Rpc.Error.is(parsed)?.id, 7);
      },
      close() {},
    } satisfies Rpc.WebSocket.Peer;

    transport.server.open(peer);
    transport.server.message(
      peer,
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "invalid" }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
