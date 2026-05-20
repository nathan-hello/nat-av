import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { natav, schema } from "./data.ts";
import { RpcDebugServer } from "@av/rpc/debug/server";
import { DebugRpcMethods } from "@av/rpc/debug/types";
import { RPCRequest, RPCResponse } from "@av/rpc/protocol";
import { System } from "@av/system";

class FakeDebugSocket {
  readyState = 1;
  messages: string[] = [];

  send(message: string) {
    this.messages.push(message);
  }

  close() {}
}

describe("debug rpc schema", () => {
  it("serves the extracted schema over the debug websocket", async () => {
    const system = new System<typeof natav>({ natav });
    const server = new RpcDebugServer<typeof natav>({ natav, system, schema: schema.toJSON() });
    const socket = new FakeDebugSocket();

    await server.WsMessageHandler(
      new MessageEvent("message", {
        data: JSON.stringify(new RPCRequest(1, DebugRpcMethods.GetSchema)),
      }),
      socket,
    );

    assert.equal(socket.messages.length, 1);

    const response = RPCResponse.parse(JSON.parse(socket.messages[0] ?? "null"));
    assert.ok(response);
    assert.deepEqual(response?.result.entry, {
      filePath: "/home/nate/code/nat-av/av/test/schema/data.ts",
      exportName: "natav",
    });
    assert.equal(response?.result.properties.configs.type.items[0].properties.api.type.kind, "object");
  });
});
