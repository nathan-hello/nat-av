import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RoomOSFormatter } from "@av/drivers/cisco/roomos/writer";
import type { RoomOS } from "@av/drivers/cisco/roomos/types";

describe("roomos writer", () => {
  it("serializes command, get, set, and listen operations", () => {
    const command: RoomOS.WriteOperation = {
      kind: "command",
      root: "xCommand",
      path: ["xCommand", "Dial"],
      args: { Number: "12345" },
    };

    assert.equal(
      RoomOSFormatter.ToTerminal(command, 9),
      'xCommand Dial Number: "12345" | resultId="9"',
    );
    assert.equal(
      RoomOSFormatter.ToJsonRpc(command, 9),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xCommand/Dial",
        params: { Number: "12345" },
        id: 9,
      }),
    );
    assert.equal(
      RoomOSFormatter.ToXml(command, 9),
      '<Command id="9" method="xCommand/Dial"><Number>12345</Number></Command>',
    );

    const commandWithBody: RoomOS.WriteOperation = {
      kind: "command",
      root: "xCommand",
      path: ["xCommand", "Dial"],
      body: "*123#",
    };

    assert.equal(
      RoomOSFormatter.ToJsonRpc(commandWithBody, 4),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xCommand/Dial",
        params: { body: "*123#" },
        id: 4,
      }),
    );

    const listen: RoomOS.WriteOperation = {
      kind: "sub",
      root: "xFeedback",
      path: [
        "xFeedback",
        "Event",
        "Bluetooth",
        "Streaming",
        "PlaybackPosition",
      ],
    };

    assert.equal(
      RoomOSFormatter.ToTerminal(listen, 9),
      'xfeedback register /Event/Bluetooth/Streaming/PlaybackPosition | resultId="9"',
    );
    assert.equal(
      RoomOSFormatter.ToJsonRpc(listen, 1),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Subscribe",
        params: {
          Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
          NotifyCurrentValue: true,
        },
        id: 1,
      }),
    );
  });
});
