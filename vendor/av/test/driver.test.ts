import { Manager } from "@av/drivers";
import { RPCRequest } from "@av/rpc/protocol";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { Test } from "@av/test/data.test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("test driver", () => {
  const driver = new Test.Driver({
    name: "shim-1",
    socket: new Test.Socket(),
  });

  const natav = new Manager({ drivers: [driver], deferred: [] });

  it("registers the shim driver", () => {
    assert.deepEqual(natav.GetAllDriverNames(), ["shim-1"]);
    assert.equal(natav.GetDriver("shim-1").name, "shim-1");
  });

  it("exposes the shim driver state and api", () => {
    assert.equal(driver.name, "shim-1");
    assert.equal(driver._drivername, "test-shim");
    assert.equal(driver.state.connected, false);
    assert.equal(driver.state.lastFrame, "");
    assert.equal(typeof driver.api.ping, "function");
    assert.equal(typeof driver.api.send, "function");
    assert.equal(driver.socket.name, "test-socket");
  });

  it("forwards driver events through the rpc server per subscription", async () => {
    const eventDriver = new Test.EventDriver("event-1");
    const natav = new Manager({ drivers: [eventDriver], deferred: [] });
    const router = new DeviceRpcRouter(natav);
    const makePeer = (addr: string) => {
      const sent: string[] = [];
      return {
        addr,
        readyState: 1,
        sent,
        send(message: string) {
          sent.push(message);
        },
        close() {},
      };
    };

    const peer1 = makePeer("peer-1");
    const peer2 = makePeer("peer-2");

    await router.handle(
      new RPCRequest(1, "device.events.subscribe", {
        device: "event-1",
        method: "tick",
      }),
      peer1,
    );

    await router.handle(
      new RPCRequest(2, "device.events.subscribe", {
        device: "event-1",
        method: "tick",
      }),
      peer1,
    );

    await router.handle(
      new RPCRequest(3, "device.events.subscribe", {
        device: "event-1",
        method: "tick",
      }),
      peer2,
    );

    eventDriver.emitTick(1);

    assert.equal(peer1.sent.length, 2);
    assert.equal(peer2.sent.length, 1);
    assert.deepEqual(JSON.parse(peer1.sent[0]), {
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "natav:device:event",
        name: "event-1",
        event: "tick",
        data: { count: 1 },
      },
    });

    await router.handle(
      new RPCRequest(4, "device.events.unsubscribe", {
        device: "event-1",
        method: "tick",
      }),
      peer1,
    );

    eventDriver.emitTick(2);

    assert.equal(peer1.sent.length, 3);
    assert.equal(peer2.sent.length, 2);
  });
});
