import { Driver, Manager } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { ClientRpc } from "@av/rpc/client";
import { RPCRequest } from "@av/rpc/protocol";
import { RPCServer } from "@av/rpc/server";
import { DeviceRpcRouter } from "@av/rpc/server/device";
import { Test } from "@av/test/data.test";
import type { Rpc } from "@av/types";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("rpc deps", () => {
  function NewTick() {
    return new TypedEventTarget<{ tick: { count: number } }>();
  }

  type PingApi = {
    ping: () => Promise<string>;
  };

  class LeafDriver extends Driver<"leaf"> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "leaf-pong",
    };
    events = NewTick();
    constructor() {
      super({ name: "leaf", driverName: "node-driver" });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class Level3Driver extends Driver<"level-3", { leaf: LeafDriver }> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "level-3-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(private leaf: LeafDriver) {
      super({ name: "level-3", driverName: "node-driver" });
      this.deps.set({ leaf: this.leaf });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class Level2Driver extends Driver<"level-2", { "level-3": Level3Driver }> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "level-2-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(private level3: Level3Driver) {
      super({ name: "level-2", driverName: "node-driver" });
      this.deps.set({ "level-3": this.level3 });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class RootDriver extends Driver<"root", { "level-2": Level2Driver }> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "root-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(private level2: Level2Driver) {
      super({ name: "root", driverName: "node-driver" });
      this.deps.set({ "level-2": this.level2 });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  type TestPeer = Rpc.WebSocket.Peer & { sent: string[] };

  function makePeer(addr: string): TestPeer {
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
  }

  it("walks a four-level dependency tree on the server and through rpc", async () => {
    const leaf = new LeafDriver();
    const level3 = new Level3Driver(leaf);
    const level2 = new Level2Driver(level3);
    const root = new RootDriver(level2);

    const natav = new Manager({ drivers: [root] });
    assert.deepEqual(natav.GetAllDriverNames(), [
      "root",
      "level-2",
      "level-3",
      "leaf",
    ]);
    assert.equal(natav.GetDriver("leaf"), leaf);
    assert.equal(natav.FindDriver("level-3"), level3);

    const router = new DeviceRpcRouter(natav);
    const serverPeer = makePeer("server-peer");

    const serverCall = await router.handle(
      new RPCRequest(1, "device.call", {
        device: "leaf",
        method: "ping",
        args: [],
      }),
      serverPeer,
    );

    assert.deepEqual(
      JSON.stringify(serverCall),
      JSON.stringify({
        id: 1,
        result: "leaf-pong",
        jsonrpc: "2.0",
      }),
    );

    await router.handle(
      new RPCRequest(2, "device.events.subscribe", {
        device: "leaf",
        method: "tick",
        args: [],
      }),
      serverPeer,
    );

    leaf.emitTick(1);

    assert.equal(serverPeer.sent.length, 1);
    assert.deepEqual(JSON.parse(serverPeer.sent[0] ?? "{}"), {
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "natav:device:event",
        name: "leaf",
        event: "tick",
        data: { count: 1 },
      },
    });

    const server = new RPCServer({ natav });
    const transport = new Test.RpcClient(server);
    const client = new ClientRpc<(typeof natav)["configs"]>({ transport });

    const ready = new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });

    transport.connect();
    await ready;

    const clientRoot = client.device("root");
    const clientLevel2 = clientRoot.deps.get("level-2");
    const clientLevel3 = clientLevel2.deps.get("level-3");
    const clientLeaf = clientLevel3.deps.get("leaf");

    assert.equal(await clientRoot.api.ping(), "root-pong");
    assert.equal(await clientLevel2.api.ping(), "level-2-pong");
    assert.equal(await clientLevel3.api.ping(), "level-3-pong");
    assert.equal(await clientLeaf.api.ping(), "leaf-pong");

    const received: Array<{ count: number }> = [];
    const off = await clientLeaf.event.on("tick", (payload) => {
      received.push(payload);
    });

    leaf.emitTick(2);
    assert.deepEqual(received, [{ count: 2 }]);

    await off();
    leaf.emitTick(3);
    assert.deepEqual(received, [{ count: 2 }]);

    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "root",
            method: "ping",
            args: [],
          },
          id: 0,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "level-2",
            method: "ping",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "level-3",
            method: "ping",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "device.call",
          params: {
            device: "leaf",
            method: "ping",
            args: [],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.subscribe",
          params: {
            device: "leaf",
            method: "tick",
            args: [],
          },
          id: 4,
        },
        {
          jsonrpc: "2.0",
          method: "device.events.unsubscribe",
          params: {
            device: "leaf",
            method: "tick",
            args: [],
          },
          id: 5,
        },
      ],
    );

    client.close();
  });
});
