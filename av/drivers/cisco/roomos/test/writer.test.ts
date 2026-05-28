import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProxy } from "@av/drivers/cisco/roomos/proxy";
import { RoomOSWriter } from "@av/drivers/cisco/roomos/writer";

describe("roomos writer", () => {
  it("serializes command, get, set, and listen operations", () => {
    const command = new RoomOSWriter({
      kind: "command",
      root: "xCommand",
      path: ["xCommand", "Dial"],
      args: { Number: "12345" },
    });

    assert.equal(command.ToTerminal(), 'xCommand Dial Number: "12345"');
    assert.equal(
      command.ToJsonRpc(9),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xCommand/Dial",
        params: { Number: "12345" },
        id: 9,
      }),
    );
    assert.equal(
      command.ToXml(9),
      '<Command id="9" method="xCommand/Dial"><Number>12345</Number></Command>',
    );

    const listen = new RoomOSWriter({
      kind: "listen",
      root: "xFeedback",
      path: ["xFeedback", "Bluetooth", "Streaming", "PlaybackPosition"],
    });

    assert.equal(
      listen.ToTerminal(),
      "xfeedback register /Event/Bluetooth/Streaming/PlaybackPosition",
    );
    assert.equal(
      listen.ToJsonRpc(1),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Subscribe",
        params: {
          Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
        },
        id: 1,
      }),
    );
  });

  it("builds proxy calls as serialized strings", () => {
    const api = createProxy(
      "xConfiguration",
      {
        type: "jsonrpc",
        getId: () => 5,
      },
      ["xConfiguration"],
    );

    assert.equal(
      api.Bluetooth.Allowed.get(),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xGet",
        params: { Path: ["Configuration", "Bluetooth", "Allowed"] },
        id: 5,
      }),
    );

    assert.equal(
      api.Bluetooth.set({ Allowed: "True" }),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xSet",
        params: {
          Path: ["Configuration", "Bluetooth"],
          Value: { Allowed: "True" },
        },
        id: 5,
      }),
    );
  });
});
