import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Driver } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { Orchistrator } from "@av/lib/orch";
import { ClientRpc } from "@av/rpc/client";
import { type ClientRpcTransport } from "@av/rpc/client/websocket";
import { RPCRequest } from "@av/rpc/protocol";
import { RPCServer } from "@av/rpc/server";
import { System } from "@av/system";

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

class InMemoryRpcTransport
  extends TypedEventTarget<WebSocketEventMap>
  implements ClientRpcTransport
{
  readyState: number = WebSocket.CLOSED;
  sent: string[] = [];

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
    this.dispatch("message", new MessageEvent("message", { data: message }));
  }
}

describe("rpc device events", () => {
  it("subscribes, receives, and unsubscribes through rpc", async () => {
    const eventDriver = new EventDriver("event-1");
    const natav = new Orchistrator([eventDriver]);
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
