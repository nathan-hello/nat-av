import { CiscoRoomOS } from "@drivers/cisco/roomos";
import { TestSocket } from "@av/test/data";
import assert from "node:assert/strict";
import { it } from "node:test";

it("writes connect-time setup messages", async () => {
  const socket = new TestSocket(
    [
      {
        onWrite: "xPreferences OutputMode json\r",
        sendBack: "",
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xFeedback/Subscribe",
          params: {
            Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
            NotifyCurrentValue: true,
          },
          id: 0,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Id: 1 },
          id: 0,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  new CiscoRoomOS({
    name: "roomos-connect-test",
    socket,
    strict: true,
    subscriptions: {
      xFeedback: {
        Bluetooth: {
          Streaming: {
            PlaybackPosition: true,
          },
        },
      },
    },
  });

  assert.equal(socket.writes.length, 0);

  socket.dispatch("connected", undefined);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(socket.writes.length, 2);

  assert.deepEqual(
    socket.writes.map((write) => write.toString("utf8")),
    [
      "xPreferences OutputMode json\r",
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Subscribe",
        params: {
          Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
          NotifyCurrentValue: true,
        },
        id: 0,
      }),
    ],
  );
});
