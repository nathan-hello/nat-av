import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import { TestSocket } from "@av/test/data";
import type { Sockets } from "@av/types";
import assert from "node:assert/strict";
import { it } from "node:test";

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
    strict: true,
    subscriptions: {
      xConfiguration: {
        Bluetooth: {
          Allowed: true,
        },
      },
      xStatus: {
        UserInterface: {
          WebView: true,
        },
      },
      xFeedback: {
        Bluetooth: {
          Streaming: {
            PlaybackPosition: true,
          },
        },
      },
    },
  });

  const strictSocket: Sockets.Client = {
    name: "roomos-strict-state",
    start() {},
    end() {},
    write() {
      return 0;
    },
    on() {
      return () => {};
    },
  };

  const strictRoomos = new CiscoRoomOS({
    name: "roomos-strict-state",
    socket: strictSocket,
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
    assert.equal(roomos.state.xConfiguration.Bluetooth.Allowed, "True");
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

  it("strict state omits unsubscribed roots", () => {
    assert.equal(Reflect.get(strictRoomos.state, "xConfiguration"), undefined);
    assert.equal(Reflect.get(strictRoomos.state, "xStatus"), undefined);
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

it("hydrates camera arrays and runs newer async commands", async () => {
  const socket = new TestSocket(
    [
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xGet",
          params: { Path: ["Status"] },
          id: 0,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: {
            Camera: [
              {
                DetectedConnector: 1,
                Flip: "Off",
                HardwareID: "cam-1",
                MacAddress: "aa:bb:cc:dd:ee:01",
                Position: { Focus: 10, Lens: "Wide" },
                SerialNumber: "S1",
              },
              {
                DetectedConnector: 2,
                Flip: "On",
                HardwareID: "cam-2",
                MacAddress: "aa:bb:cc:dd:ee:02",
                Position: { Focus: 20, Lens: "Tele" },
                SerialNumber: "S2",
              },
            ],
          },
          id: 0,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xCommand/Bookings/Get",
          params: { Id: "booking-123" },
          id: 1,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: {
            Id: "booking-123",
            Title: "Design Review",
          },
          id: 1,
        },
      },
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xCommand/Provisioning/RoomType/Activate",
          params: { Name: "Standard" },
          id: 2,
        }),
        sendBack: {
          jsonrpc: "2.0",
          result: { Activated: true },
          id: 2,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  const roomos = new CiscoRoomOS({
    name: "roomos-e2e",
    socket,
    strict: true,
    subscriptions: {
      xStatus: {
        Cameras: {
          Camera: true,
        },
      },
    },
  });

  assert.notEqual(roomos.state.xStatus.Cameras, undefined);

  const cameras = await roomos.api.xStatus.get();
  assert.deepEqual(cameras, {
    ok: true,
    data: {
      Camera: [
        {
          DetectedConnector: 1,
          Flip: "Off",
          HardwareID: "cam-1",
          MacAddress: "aa:bb:cc:dd:ee:01",
          Position: { Focus: 10, Lens: "Wide" },
          SerialNumber: "S1",
        },
        {
          DetectedConnector: 2,
          Flip: "On",
          HardwareID: "cam-2",
          MacAddress: "aa:bb:cc:dd:ee:02",
          Position: { Focus: 20, Lens: "Tele" },
          SerialNumber: "S2",
        },
      ],
    },
  });

  assert.notEqual(roomos.state.xStatus.Cameras.Camera, undefined);

  const booking = await roomos.api.xCommand.Bookings.Get({ Id: "booking-123" });
  assert.deepEqual(booking, {
    ok: true,
    data: {
      Id: "booking-123",
      Title: "Design Review",
    },
  });

  const roomType = await roomos.api.xCommand.Provisioning.RoomType.Activate({
    Name: "Standard",
  });
  assert.deepEqual(roomType, {
    ok: true,
    data: { Activated: true },
  });
});

it("returns an RPCError when a status fetch fails", async () => {
  const socket = new TestSocket(
    [
      {
        onWrite: JSON.stringify({
          jsonrpc: "2.0",
          method: "xGet",
          params: { Path: ["Status"] },
          id: 0,
        }),
        sendBack: {
          jsonrpc: "2.0",
          error: {
            code: 1234,
            message: "camera fetch failed",
          },
          id: 0,
        },
      },
    ],
    { throwIfWriteNotFound: true },
  );

  const roomos = new CiscoRoomOS({
    name: "roomos-e2e-error",
    socket,
    strict: true,
    subscriptions: {
      xStatus: {
        Cameras: {
          Camera: true,
        },
      },
    },
  });

  const result = await roomos.api.xStatus.get();
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 1234,
      message: "camera fetch failed",
      data: {
        kind: "get",
        root: "xStatus",
        path: ["xStatus"],
      },
    },
  });
});
