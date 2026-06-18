import { Manager } from "@av/drivers";
import { DriverRpcRouter } from "@av/rpc/server/driver";
import { Test } from "@av/test/data.test";
import { Rpc } from "@av/types";
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
    assert.equal(driver.state.connected, false);
    assert.equal(driver.state.lastFrame, "init");
    assert.equal(typeof driver.api.ping, "function");
    assert.equal(typeof driver.api.send, "function");
    assert.equal(driver.socket.name, "test-socket");
  });

  it("forwards driver events through the rpc server per subscription", async () => {
    const eventDriver = new Test.EventDriver("event-1");
    const natav = new Manager({ drivers: [eventDriver], deferred: [] });
    const router = new DriverRpcRouter(natav);
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
      Rpc.Request.driverSubscribe(1, {
        driver: "event-1",
        method: "tick",
      }),
      peer1,
    );

    await router.handle(
      Rpc.Request.driverSubscribe(2, {
        driver: "event-1",
        method: "tick",
      }),
      peer1,
    );

    await router.handle(
      Rpc.Request.driverSubscribe(3, {
        driver: "event-1",
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
        type: "natav:driver:event",
        name: "event-1",
        event: "tick",
        data: { count: 1 },
      },
    });

    await router.handle(
      Rpc.Request.driverUnsubscribe(4, {
        driver: "event-1",
        method: "tick",
      }),
      peer1,
    );

    eventDriver.emitTick(2);

    assert.equal(peer1.sent.length, 3);
    assert.equal(peer2.sent.length, 2);
  });
});
