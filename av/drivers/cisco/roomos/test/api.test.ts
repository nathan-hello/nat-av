import assert from "node:assert/strict";
import { it } from "node:test";

import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import { TestSocket } from "@av/test/socket";
import { StartLogging } from "@av/telemetry/sdk";
import { ConsoleExporter } from "@av/telemetry/exporters";

StartLogging([new ConsoleExporter("ERROR")]);

it("api writes to socket, state gets updated on notification", async () => {
  let highestId = 0;
  const socket = new TestSocket(
    [
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xGet",
          params: { Path: ["Configuration", "Bluetooth", "Allowed"] },
          id: highestId++,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Allowed: "True" },
          id: highestId,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xSet",
          params: {
            Path: ["Configuration", "Bluetooth"],
            Value: { Allowed: "True", Enabled: "False" },
          },
          id: highestId++,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Allowed: "True", Enabled: "False" },
          id: highestId,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xCommand/Dial",
          params: { Number: "12345" },
          id: highestId++,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Number: "12345" },
          id: highestId,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xFeedback/Subscribe",
          params: {
            Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
            NotifyCurrentValue: true,
          },
          id: highestId++,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: {},
          id: highestId,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  const roomos = new CiscoRoomOS({
    name: "roomos-writer-test",
    socket,
    subscriptions: {
      UserInterface: true,
    },
  });

  assert.equal(Reflect.get(roomos.api.xConfiguration, "then"), undefined);

  assert.deepEqual(await roomos.api.xConfiguration.Bluetooth.Allowed.get(), {
    ok: true,
    data: { Allowed: "True" },
  });

  assert.deepEqual(roomos.state.Bluetooth.Allowed, {
    Allowed: "True",
    Enabled: null,
  });

  assert.deepEqual(
    await roomos.api.xConfiguration.Bluetooth.set({
      Allowed: "True",
      Enabled: "False",
    }),
    {
      ok: true,
      data: { Allowed: "True", Enabled: "False" },
    },
  );

  assert.deepEqual(roomos.state.Bluetooth.Allowed, {
    Allowed: "True",
    Enabled: "False",
  });

  assert.deepEqual(await roomos.api.xCommand.Dial({ Number: "12345" }), {
    ok: true,
    data: { Number: "12345" },
  });
  assert.deepEqual(
    await roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe(),
    {
      ok: true,
      data: {},
    },
  );

  assert.deepEqual(socket.writes, [
    JSON.stringify({
      jsonrpc: "2.0",
      method: "xGet",
      params: { Path: ["Configuration", "Bluetooth", "Allowed"] },
      id: 0,
    }),
    JSON.stringify({
      jsonrpc: "2.0",
      method: "xSet",
      params: {
        Path: ["Configuration", "Bluetooth"],
        Value: { Allowed: "True", Enabled: "False" },
      },
      id: 1,
    }),
    JSON.stringify({
      jsonrpc: "2.0",
      method: "xCommand/Dial",
      params: { Number: "12345" },
      id: 2,
    }),
    JSON.stringify({
      jsonrpc: "2.0",
      method: "xFeedback/Subscribe",
      params: {
        Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
        NotifyCurrentValue: true,
      },
      id: 3,
    }),
  ]);
});
