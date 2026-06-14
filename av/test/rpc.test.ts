import { Manager } from "@av/drivers";
import { Bus } from "@av/lib/bus";
import { ClientRpc } from "@av/rpc/client";
import { RPCServer } from "@av/rpc/server";
import { EventDriver, TestRpcClient } from "@av/test/data";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc device events", () => {
  it("subscribes, receives, and unsubscribes through rpc", async () => {
    const eventDriver = new EventDriver("event-1");
    const bus = new Bus();
    const natav = new Manager({ bus, drivers: [eventDriver], deferred: [] });
    const server = new RPCServer({ natav });
    const transport = new TestRpcClient(server);
    const client = new ClientRpc<(typeof natav)["configs"]>({ transport });

    transport.connect();
    await new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });

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
        { jsonrpc: "2.0", method: "system.state", id: 0 },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
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
    const off2 = await device.event.on("tick", (payload) => {
      received.push(payload);
    });
    eventDriver.emitTick(3);
    assert.deepEqual(received, [{ count: 1 }, { count: 3 }]);
    await off2();

    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        { jsonrpc: "2.0", method: "system.state", id: 0 },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "event-1",
            method: "tick",
            args: [],
          },
          id: 4,
        },
      ],
    );
  });
});
