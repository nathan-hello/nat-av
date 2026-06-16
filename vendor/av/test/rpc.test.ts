import {
  Client,
  Driver,
  Manager,
  Rpc,
  Server,
  Test,
  type Drivers,
} from "@av/index";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc device events", () => {
  it("narrows parsed notifications into server notifications", () => {
    const notification = Rpc.Notification.is({
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "natav:device:event",
        name: "event-1",
        event: "tick",
        data: { count: 1 },
      },
    });

    assert.ok(notification);

    const serverNotification = Rpc.Notification.Server.from(notification);

    assert.ok(serverNotification);
    assert.equal(serverNotification.type, "natav:device:event");
    assert.deepEqual(serverNotification.params, {
      type: "natav:device:event",
      name: "event-1",
      event: "tick",
      data: { count: 1 },
    });
  });

  it("subscribes, receives, and unsubscribes through rpc", async () => {
    const eventDriver = new Test.EventDriver("event-1");
    const natav = new Manager({
      drivers: [eventDriver],
      deferred: [() => new Test.EventDriver("defer")],
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

    const device = client.device("event-1");
    const received: Array<{ count: number }> = [];
    const off1 = await device.event.on("tick", (payload) => {
      received.push(payload);
    });

    eventDriver.emitTick(1);

    assert.deepEqual(received, [{ count: 1 }]);
    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 0,
        },
      ],
    );

    // Verify that off() works
    await off1();
    eventDriver.emitTick(2);
    assert.deepEqual(received, [{ count: 1 }]);

    // Verify it works again
    const off2 = await device.event.on("tick", (payload) => {
      received.push(payload);
    });
    eventDriver.emitTick(3);
    assert.deepEqual(received, [{ count: 1 }, { count: 3 }]);
    await off2();

    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 0,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 3,
        },
      ],
    );

    client.close();
  });

  it("injects a typed client id into device api calls", async () => {
    type PeerContext = Rpc.Server.Context<"CLIENT_1">;

    class PeerAwareDriver extends Driver<
      "peer-aware",
      {},
      string,
      {
        identify: () => Promise<string>;
      },
      { label: string }
    > {
      api = {
        identify: async () => this.natav.GetContext()?.clientId ?? "UNKNOWN",
      };

      constructor(
        private natav: Drivers.ManagerView<
          readonly [PeerAwareDriver],
          PeerContext
        >,
      ) {
        super({ name: "peer-aware", driverName: "peer-aware-driver" });
      }

      get state() {
        return { label: this.natav.GetContext().clientId ?? "UNKNOWN" };
      }
    }

    const natav = new Manager<
      readonly [],
      readonly [typeof PeerAwareDriver],
      PeerContext
    >({
      drivers: [] as const,
      deferred: [PeerAwareDriver] as const,
    });
    const transport = new Test.RpcTransport();
    const clientIds = { "in-memory": "CLIENT_1" } as const;
    new Server.Rpc({ natav, transport: transport.server, clientIds });
    const client = new Client.Rpc<(typeof natav)["configs"]>({
      transport,
    });

    const ready = new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });
    const peer = new Promise<Rpc.Server.Context>((resolve) => {
      const off = client.on("peer", (value) => {
        off();
        resolve(value);
      });
    });

    transport.connect();
    await ready;

    assert.equal((await peer).clientId, "CLIENT_1");
    assert.equal(client.peer?.clientId, "CLIENT_1");
    assert.equal(client.device("peer-aware").state?.label, "CLIENT_1");
    assert.equal(await client.device("peer-aware").api.identify(), "CLIENT_1");

    client.close();
  });
});
