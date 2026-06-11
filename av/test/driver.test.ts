import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Driver } from "@av/drivers";
import { Orchistrator } from "@av/lib/orch";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { RPCRequest } from "@av/rpc/protocol";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { driver } from "./data.ts";

class EventDriver<const N extends string = string> extends Driver<
  N,
  {},
  "event-driver",
  {},
  { ready: boolean },
  TypedEventTarget<{ tick: { count: number } }>
> {
  state = { ready: true };
  api = {};
  socket = undefined;
  schema = undefined;
  events = new TypedEventTarget<{ tick: { count: number } }>();

  constructor(name: N) {
    super({ name, driverName: "event-driver" });
  }

  emitTick(count: number) {
    this.events.dispatch("tick", { count });
  }
}

describe("test driver", () => {
  it("exposes the shim driver state and api", () => {
    assert.equal(driver.name, "shim-1");
    assert.equal(driver._drivername, "test-shim");
    assert.equal(driver.state.connected, false);
    assert.equal(driver.state.lastFrame, "");
    assert.equal(typeof driver.api.ping, "function");
    assert.equal(typeof driver.api.send, "function");
    assert.equal(driver.socket.name, "TcpClient::127.0.0.1:12345");
  });

  it("forwards driver events through the rpc server per subscription", async () => {
    const eventDriver = new EventDriver("event-1");
    const natav = new Orchistrator([eventDriver]);
    const router = new DeviceRpcRouter<typeof natav>(natav);
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
