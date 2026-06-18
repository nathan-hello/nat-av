import { Driver, Manager } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { RpcClient } from "@av/rpc/client";
import { RpcServer } from "@av/rpc/server";
import { DriverRpcRouter } from "@av/rpc/server/driver";
import { Test } from "@av/test/data.test";
import { Rpc } from "@av/types";
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
      super({ name: "leaf" });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class Level3Driver extends Driver<"level-3", [LeafDriver]> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "level-3-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(leaf: LeafDriver) {
      super({ name: "level-3", deps: [leaf] });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class Level2Driver extends Driver<"level-2", [Level3Driver]> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "level-2-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(level3: Level3Driver) {
      super({ name: "level-2", deps: [level3] });
    }
    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  class RootDriver extends Driver<"root", [Level2Driver]> {
    state: { ready: boolean } = { ready: true };
    api: PingApi = {
      ping: async () => "root-pong",
    };
    socket = undefined;
    events = NewTick();
    constructor(level2: Level2Driver) {
      super({ name: "root", deps: [level2] });
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
    type natav = typeof natav;
    assert.deepEqual(natav.GetAllDriverNames(), [
      "root",
      "level-2",
      "level-3",
      "leaf",
    ]);
    assert.equal(natav.GetDriver("leaf"), leaf);
    assert.equal(natav.FindDriver("level-3"), level3);

    const router = new DriverRpcRouter(natav);
    const serverPeer = makePeer("server-peer");

    const serverCall = await router.handle(
      Rpc.Request.driverCall(1, {
        driver: "leaf",
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
      Rpc.Request.driverSubscribe(2, {
        driver: "leaf",
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
        type: "natav:driver:event",
        name: "leaf",
        event: "tick",
        data: { count: 1 },
      },
    });

    const transport = new Test.RpcTransport();
    new RpcServer({ natav, transport: transport.server });
    const client = new RpcClient<natav>({ transport });

    const ready = new Promise<void>((resolve) => {
      const off = client.on("ready", () => {
        off();
        resolve();
      });
    });

    transport.connect();
    await ready;

    const clientRoot = client.driver("root");
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

    const initMsg = transport.sent.map((m) => JSON.parse(m))[0];
    assert.deepEqual(initMsg, {
      id: 0,
      jsonrpc: "2.0",
      method: "driver.init",
    });

    assert.deepEqual(
      transport.sent.map((message) => JSON.parse(message)),
      [
        {
          id: 0,
          jsonrpc: "2.0",
          method: "driver.init",
        },
        {
          jsonrpc: "2.0",
          method: "driver.call",
          params: {
            driver: "root",
            method: "ping",
            args: [],
          },
          id: 1,
        },
        {
          jsonrpc: "2.0",
          method: "driver.call",
          params: {
            driver: "level-2",
            method: "ping",
            args: [],
          },
          id: 2,
        },
        {
          jsonrpc: "2.0",
          method: "driver.call",
          params: {
            driver: "level-3",
            method: "ping",
            args: [],
          },
          id: 3,
        },
        {
          jsonrpc: "2.0",
          method: "driver.call",
          params: {
            driver: "leaf",
            method: "ping",
            args: [],
          },
          id: 4,
        },
        {
          jsonrpc: "2.0",
          method: "driver.events.subscribe",
          params: {
            driver: "leaf",
            method: "tick",
            args: [],
          },
          id: 5,
        },
        {
          jsonrpc: "2.0",
          method: "driver.events.unsubscribe",
          params: {
            driver: "leaf",
            method: "tick",
            args: [],
          },
          id: 6,
        },
      ],
    );

    client.close();
  });
});
