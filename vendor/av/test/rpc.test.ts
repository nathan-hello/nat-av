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

describe("rpc driver events", () => {
  it("narrows parsed notifications into server notifications", () => {
    const notification = Rpc.Notification.is({
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "natav:driver:event",
        name: "event-1",
        event: "tick",
        data: { count: 1 },
      },
    });

    assert.ok(notification);

    const serverNotification = Rpc.Notification.Server.from(notification);

    assert.ok(serverNotification);
    assert.equal(serverNotification.type, "natav:driver:event");
    assert.deepEqual(serverNotification.params, {
      type: "natav:driver:event",
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
    type natav = typeof natav;
    const transport = new Test.RpcTransport();
    new Server.Rpc({ natav, transport: transport.server });
    const client = new Client.Rpc<natav>({
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

    const driver = client.driver("event-1");
    const received: Array<{ count: number }> = [];
    const off1 = await driver.event.on("tick", (payload) => {
      received.push(payload);
    });

    eventDriver.emitTick(1);

    assert.deepEqual(received, [{ count: 1 }]);
    const sent = () => transport.sent.map((message) => JSON.parse(message));

    assert.deepEqual(
      sent().slice(1),
      [
        {
          jsonrpc: "2.0",
          method: "driver.events.subscribe",
          params: {
            driver: "event-1",
            method: "tick",
            args: [],
          },
          id: 1,
        },
      ],
    );

    // Verify that off() works
    await off1();
    eventDriver.emitTick(2);
    assert.deepEqual(received, [{ count: 1 }]);

    // Verify it works again
    const off2 = await driver.event.on("tick", (payload) => {
      received.push(payload);
    });
    eventDriver.emitTick(3);
    assert.deepEqual(received, [{ count: 1 }, { count: 3 }]);
    await off2();

    assert.deepEqual(
      sent().slice(1),
      [
        {
          jsonrpc: "2.0",
          method: "driver.events.subscribe",
          params: {
            driver: "event-1",
            method: "tick",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "driver.events.unsubscribe",
          params: {
            driver: "event-1",
            method: "tick",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "driver.events.subscribe",
          params: {
            driver: "event-1",
            method: "tick",
            args: [],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "driver.events.unsubscribe",
          params: {
            driver: "event-1",
            method: "tick",
            args: [],
          },
          id: 4,
        },
      ],
    );

    client.close();
  });

  it("injects a typed client id into driver api calls", async () => {
    type PeerContext = Rpc.Server.Context<"CLIENT_1">;

    class PeerAwareDriver extends Driver<
      "peer-aware",
      [],
      { identify: () => Promise<string> },
      { label: string }
    > {
      api = {
        identify: async () => this.natav.GetContext()?.name ?? "UNKNOWN",
      };

      constructor(
        private natav: Drivers.ManagerView<
          readonly [PeerAwareDriver],
          PeerContext
        >,
      ) {
        super({ name: "peer-aware" });
      }

      get state() {
        return { label: this.natav.GetContext().name ?? "UNKNOWN" };
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
    type natav = typeof natav;
    const transport = new Test.RpcTransport();
    new Server.Rpc({
      natav,
      transport: transport.server,
      peerToContext: (peer): PeerContext => ({
        addr: peer.addr,
        name: "CLIENT_1" as const,
      }),
    });
    const client = new Client.Rpc<natav>({
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

    assert.equal((await peer).name, "CLIENT_1");
    assert.equal(client.ctx?.name, "CLIENT_1");
    assert.equal(client.driver("peer-aware").state?.label, "CLIENT_1");
    assert.equal(await client.driver("peer-aware").api.identify(), "CLIENT_1");

    client.close();
  });
});
