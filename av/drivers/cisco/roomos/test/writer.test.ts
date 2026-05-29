import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import { RoomOSFormatter } from "@av/drivers/cisco/roomos/writer";
import type { RoomOS } from "@av/drivers/cisco/roomos/types";
import { TestSocket } from "@av/test/socket";
import { StartLogging } from "@av/telemetry/sdk";
import { ConsoleExporter } from "@av/telemetry/exporters";

StartLogging([new ConsoleExporter("ERROR")]);

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
      kind: "listen",
      root: "xFeedback",
      path: ["xFeedback", "Bluetooth", "Streaming", "PlaybackPosition"],
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
        },
        id: 1,
      }),
    );
  });

  it("builds api calls and writes jsonrpc payloads to the socket", async () => {
    const socket = new TestSocket(
      [
        {
          onWrite: JSON.stringify({
            jsonrpc: "2.0",
            method: "xGet",
            params: { Path: ["Configuration", "Bluetooth", "Allowed"] },
            id: 0,
          }),
          sendBack: {
            jsonrpc: "2.0",
            result: { Allowed: "True" },
            id: 0,
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
            id: 1,
          }),
          sendBack: {
            jsonrpc: "2.0",
            result: { Allowed: "True", Enabled: "False" },
            id: 1,
          },
        },
        {
          onWrite: JSON.stringify({
            jsonrpc: "2.0",
            method: "xCommand/Dial",
            params: { Number: "12345" },
            id: 2,
          }),
          sendBack: {
            jsonrpc: "2.0",
            result: { Number: "12345" },
            id: 2,
          },
        },
        {
          onWrite: JSON.stringify({
            jsonrpc: "2.0",
            method: "xFeedback/Subscribe",
            params: {
              Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
            },
            id: 3,
          }),
          sendBack: {
            jsonrpc: "2.0",
            result: {},
            id: 3,
          },
        },
      ],
      { errorIfWriteNotFound: true },
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
        },
        id: 3,
      }),
    ]);
  });
});
