import { Client, Manager, Server, Test } from "@av/index";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CiscoRoomOS } from "../index";

describe("rpc roomos device", () => {
  it("calls roomos methods and receives roomos events through rpc", async () => {
    const socket = new Test.Socket(
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
              Cameras: {
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
            result: { Id: "booking-123", Title: "Design Review" },
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
      name: "roomos-rpc",
      socket,
      strict: true,
      subscriptions: {
        xStatus: {
          Cameras: {
            Camera: true,
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

    const natav = new Manager({
      drivers: [roomos],
      deferred: [],
    });
    const transport = new Test.RpcTransport();
    new Server.Rpc({ natav, transport: transport.server });
    const client = new Client.Rpc<(typeof natav)["configs"]>({
      transport,
    });

    const ready = new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });

    transport.connect();
    await ready;

    const device = client.device("roomos-rpc");
    const received: Array<{ Position: number }> = [];
    const off = await device.event.on(
      "Bluetooth Streaming PlaybackPosition",
      (payload) => {
        received.push(payload);
      },
    );

    const status = await device.api.xStatus.get();
    assert.deepEqual(status, {
      ok: true,
      data: {
        Cameras: {
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
      },
    });

    it("goes into the device.state object", () => {
      assert.deepEqual(device.state.xStatus.Cameras.Camera[0], {
        DetectedConnector: 1,
        Flip: "Off",
        HardwareID: "cam-1",
        MacAddress: "aa:bb:cc:dd:ee:01",
        Position: { Focus: 10, Lens: "Wide" },
        SerialNumber: "S1",
      });

      assert.deepEqual(device.state.xStatus.Cameras.Camera[1], {
        DetectedConnector: 2,
        Flip: "On",
        HardwareID: "cam-2",
        MacAddress: "aa:bb:cc:dd:ee:02",
        Position: { Focus: 20, Lens: "Tele" },
        SerialNumber: "S2",
      });
    });

    assert.equal(status.data.Cameras.Camera.length, 2);

    const booking = await device.api.xCommand.Bookings.Get({
      Id: "booking-123",
    });
    assert.deepEqual(booking, {
      ok: true,
      data: { Id: "booking-123", Title: "Design Review" },
    });

    const roomType = await device.api.xCommand.Provisioning.RoomType.Activate({
      Name: "Standard",
    });
    assert.deepEqual(roomType, {
      ok: true,
      data: { Activated: true },
    });

    const subscription =
      await device.api.xFeedback.Bluetooth.Streaming.PlaybackPosition.subscribe();
    assert.deepEqual(subscription, {
      ok: true,
      data: {
        id: 1,
        path: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
      },
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

    assert.deepEqual(received, [{ Position: 6 }]);

    await off();

    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "roomos-rpc",
            method: "Bluetooth Streaming PlaybackPosition",
            args: [],
          },
          id: 0,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xStatus/get",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xCommand/Bookings/Get",
            args: [{ Id: "booking-123" }],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xCommand/Provisioning/RoomType/Activate",
            args: [{ Name: "Standard" }],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xFeedback/Bluetooth/Streaming/PlaybackPosition/subscribe",
            args: [],
          },
          id: 4,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "roomos-rpc",
            method: "Bluetooth Streaming PlaybackPosition",
            args: [],
          },
          id: 5,
        },
      ],
    );

    assert.deepEqual(
      transport.received.map((message) => JSON.parse(message)),
      [
        {
          jsonrpc: "2.0",
          method: "notification",
          params: {
            addr: "in-memory",
            clientId: "in-memory",
            type: "natav:peer",
          },
        },
        {
          jsonrpc: "2.0",
          method: "notification",
          params: {
            data: {},
            name: "roomos-rpc",
            type: "natav:state:update",
          },
        },
        { jsonrpc: "2.0", result: null, id: 0 },
        {
          jsonrpc: "2.0",
          result: {
            ok: true,
            data: {
              Cameras: {
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
            },
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          result: {
            ok: true,
            data: { Id: "booking-123", Title: "Design Review" },
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          result: { ok: true, data: { Activated: true } },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          result: {
            ok: true,
            data: {
              id: 1,
              path: ["Event", "Bluetooth", "Streaming", "PlaybackPosition"],
            },
          },
          id: 4,
        },
        {
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "natav:device:event",
            name: "roomos-rpc",
            event: "Bluetooth Streaming PlaybackPosition",
            data: { Position: 6 },
          },
        },
        { jsonrpc: "2.0", result: null, id: 5 },
      ],
    );

    client.close();
  });
});
