import assert from "node:assert/strict";
import { it } from "node:test";
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
      Bluetooth: {

        Streaming: {
          PlaybackPosition: true,
        },
      },
    },
  });

  it("xConfiguration.then is undefined", () => {
    assert.equal(Reflect.get(roomos.api.xConfiguration, "then"), undefined);
  });

  it("api.Configuration.Bluetooth.Allowed.get() === RoomOS.Result<'True'>", async () => {
    assert.deepEqual(
      await roomos.api.xConfiguration.Configuration.Bluetooth.Allowed.get(),
      {
        ok: true,
        data: "True",
      },
    );
  });

  it("state.Bluetooth.Allowed === 'True'", () => {
    assert.deepEqual(roomos.state.xConfiguration.Bluetooth.Allowed, "True");
  });

  it("api.xConfiguration.Configuration.Bluetooth.set()", async () => {
    assert.deepEqual(
      await roomos.api.xConfiguration.Configuration.Bluetooth.set({
        Allowed: "True",
        Enabled: "False",
      }),
      {
        ok: true,
        data: { Allowed: "True", Enabled: "False" },
      },
    );
  });

  it("state.Configuration.Bluetooth === obj", () => {
    assert.deepEqual(roomos.state.xConfiguration.Bluetooth, {
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
          path: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
        },
      },
    );
  });

  it("notification updates the subscribed feedback state", () => {
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Event",
        params: {
          Id: 1,
          Event: {
            Bluetooth: {
              Streaming: {
                PlaybackPosition: {
                  Position: 5,
                },
              },
            },
          },
        },
      }),
    );
    assert.equal(
      roomos.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.Position.get(),
      5,
    );
  });

  it("subscription via roomos.events.on()", async () => {
    assert.doesNotThrow(async () => {
      const foo = await new Promise<{ Position: number }>((res, rej) => {
        roomos.events.on("Bluetooth Streaming PlaybackPosition", (data) => {
          res(data);
        });
        socket.receive({
          jsonrpc: "2.0",
          method: "xFeedback/Event",
          params: {
            Id: 1,
            Event: {
              Bluetooth: {
                Streaming: {
                  PlaybackPosition: {
                    Position: 6,
                  },
                },
              },
            },
          },
        });
        setTimeout(() => {
          rej("timed out");
        }, 1000);
      });

      assert.deepEqual(foo, { Position: 6 });
    });
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
