import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import { TestSocket } from "@av/test/socket";

it("api writes to socket, state gets updated on notification", async () => {
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
          result: "True",
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
            NotifyCurrentValue: true,
          },
          id: 3,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Id: 1 },
          id: 3,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  const roomos = new CiscoRoomOS({
    name: "roomos-writer-test",
    socket,
    subscriptions: {
      Bluetooth: true,
    },
  });

  it("xConfiguration.then is undefined", () => {
    assert.equal(Reflect.get(roomos.api.xConfiguration, "then"), undefined);
  });

  it("api.Bluetooth.Allowed.get() === RoomOS.Result<'True'>", async () => {
    assert.deepEqual(await roomos.api.xConfiguration.Bluetooth.Allowed.get(), {
      ok: true,
      data: "True",
    });
  });

  it("state.Bluetooth.Allowed === 'True'", () => {
    assert.deepEqual(roomos.state.Bluetooth.Allowed, "True");
  });

  it("api.xConfiguration.Bluetooth.set()", async () => {
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
  });

  it("state.Bluetooth === obj", () => {
    assert.deepEqual(roomos.state.Bluetooth, {
      Allowed: "True",
      Enabled: "False",
    });
  });

  it("Dial", async () => {
    assert.deepEqual(await roomos.api.xCommand.Dial({ Number: "12345" }), {
      ok: true,
      data: { Number: "12345" },
    });
  });

  it("subscription", async () => {
    assert.deepEqual(
      await roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe(),
      {
        ok: true,
        data: {
          id: 1,
          path: ["xFeedback", "Bluetooth", "Streaming", "PlaybackPosition"],
        },
      },
    );
  });

  it("writes line up", () => {
    assert.deepEqual(socket.writes, [
      Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "xGet",
          params: { Path: ["Configuration", "Bluetooth", "Allowed"] },
          id: 0,
        }),
      ),
      Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "xSet",
          params: {
            Path: ["Configuration", "Bluetooth"],
            Value: { Allowed: "True", Enabled: "False" },
          },
          id: 1,
        }),
      ),
      Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "xCommand/Dial",
          params: { Number: "12345" },
          id: 2,
        }),
      ),
      Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "xFeedback/Subscribe",
          params: {
            Query: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
            NotifyCurrentValue: true,
          },
          id: 3,
        }),
      ),
    ]);
  });
});
