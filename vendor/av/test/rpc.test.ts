import { Manager } from "@av/drivers";
import { RpcClient } from "@av/rpc/client";
import { RPCServer } from "@av/rpc/server";
import { Test } from "@av/test/data.test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc device events", () => {
  it("subscribes, receives, and unsubscribes through rpc", async () => {
    const eventDriver = new Test.EventDriver("event-1");
    const natav = new Manager({
      drivers: [eventDriver],
      deferred: [() => new Test.EventDriver("defer")],
    });
    const transport = new Test.RpcTransport();
    new RPCServer({ natav, transport: transport.server });
    const client = new RpcClient<(typeof natav)["configs"]>({ transport });

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
});
