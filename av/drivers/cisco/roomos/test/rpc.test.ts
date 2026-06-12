import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CiscoRoomOS } from "@av/drivers/cisco/roomos";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { Orchistrator } from "@av/lib/orch";
import { ClientRpc } from "@av/rpc/client";
import { type ClientRpcTransport } from "@av/rpc/client/websocket";
import { RPCRequest } from "@av/rpc/protocol";
import { RPCServer } from "@av/rpc/server";
import { System } from "@av/system";
import { TestSocket } from "@av/test/socket";

describe("rpc roomos device", () => {
  class InMemoryRpcTransport
    extends TypedEventTarget<WebSocketEventMap>
    implements ClientRpcTransport
  {
    readyState: number = WebSocket.CLOSED;
    sent: string[] = [];
    received: string[] = [];

    private server: RPCServer;
    private peer: {
      addr: string;
      readonly readyState: number;
      send(message: string): void;
      close(): void;
    };

    constructor(server: RPCServer) {
      super();
      this.server = server;
      this.peer = {
        addr: "in-memory",
        get readyState() {
          return 1;
        },
        send: (message: string) => {
          this.receive(message);
        },
        close: () => {
          this.close();
        },
      };
    }

    connect() {
      this.readyState = WebSocket.OPEN;
      this.dispatch("open", new Event("open"));
    }

    close(code?: number, reason?: string) {
      this.readyState = WebSocket.CLOSED;
      this.dispatch(
        "close",
        new CloseEvent("close", {
          code: code ?? 1000,
          reason: reason ?? "",
        }),
      );
    }

    send(message: string) {
      this.sent.push(message);

      const request = RPCRequest.is(message);
      if (!request) {
        throw new Error(`invalid rpc request: ${message}`);
      }

      void this.server.handleRequest(request, this.peer).then((response) => {
        this.peer.send(JSON.stringify(response));
      });
    }

    private receive(message: string) {
      this.received.push(message);
      this.dispatch("message", new MessageEvent("message", { data: message }));
    }
  }
  it("calls roomos methods and receives roomos events through rpc", async () => {
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

    const natav = new Orchistrator([roomos]);
    const system = new System({ natav });
    const server = new RPCServer({ system, natav });
    const transport = new InMemoryRpcTransport(server);
    const client = new ClientRpc<typeof natav>({ transport });

    transport.connect();
    await new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });

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

    assert.equal(status.data.Camera.length, 2);

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
        { jsonrpc: "2.0", method: "system.state", id: 0 },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "roomos-rpc",
            method: "Bluetooth Streaming PlaybackPosition",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xStatus/get",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xCommand/Bookings/Get",
            args: [{ Id: "booking-123" }],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xCommand/Provisioning/RoomType/Activate",
            args: [{ Name: "Standard" }],
          },
          id: 4,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "roomos-rpc",
            method: "xFeedback/Bluetooth/Streaming/PlaybackPosition/subscribe",
            args: [],
          },
          id: 5,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "roomos-rpc",
            method: "Bluetooth Streaming PlaybackPosition",
            args: [],
          },
          id: 6,
        },
      ],
    );

    assert.deepEqual(
      transport.received.map((message) => JSON.parse(message)),
      [
        { jsonrpc: "2.0", result: null, id: 0 },
        { jsonrpc: "2.0", result: null, id: 1 },
        {
          jsonrpc: "2.0",
          result: {
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
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          result: {
            ok: true,
            data: { Id: "booking-123", Title: "Design Review" },
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          result: { ok: true, data: { Activated: true } },
          id: 4,
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
          id: 5,
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
        { jsonrpc: "2.0", result: null, id: 6 },
      ],
    );
  });
});
