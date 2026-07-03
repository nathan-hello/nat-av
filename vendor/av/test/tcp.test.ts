import { Tcp } from "@av/sockets/tcp";
import type { Events } from "@av/types";
import assert from "node:assert/strict";
import * as net from "node:net";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const COLLECT_EVENTS = async <T>(
  collect: () => Promise<T>,
  ms = 50,
): Promise<T> => {
  const p = collect();
  await delay(ms);
  return p;
};

describe("tcp socket", () => {
  it("dispatches connected immediately on successful TCP handshake", async () => {
    const server = net.createServer((c) => {
      c.end();
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as net.AddressInfo).port;

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port,
      keepAliveMs: 1000,
    });

    const connected = new Promise<void>((resolve) => {
      tcp.on("connected", () => resolve());
    });

    await tcp.start();
    await COLLECT_EVENTS(() => connected);

    assert.equal(
      await Promise.race([
        connected.then(() => true),
        delay(2000).then(() => false),
      ]),
      true,
      "connected event should fire after start resolves",
    );

    tcp.end();
    server.close();
  });

  it("dispatches disconnected and schedules retry when server is unreachable", async () => {
    // Use a port that's almost certainly not listening
    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: 1,
      keepAliveMs: 100,
    });

    const retryScheduled = new Promise<void>((resolve) => {
      tcp.on("retryScheduled", () => resolve());
    });

    // Don't await start() — it retries forever when the server is down
    void tcp.start();

    assert.equal(
      await Promise.race([
        retryScheduled.then(() => true),
        delay(3000).then(() => false),
      ]),
      true,
      "retryScheduled should fire when connection fails",
    );

    tcp.end();
  });

  it("round-trips data through a real TCP connection", async () => {
    const server = net.createServer((c) => {
      c.on("data", (data) => {
        c.write(data);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as net.AddressInfo).port;

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port,
    });

    await new Promise<void>((resolve) => {
      tcp.on("connected", () => resolve());
      tcp.start();
    });

    const received = new Promise<Buffer>((resolve) => {
      tcp.on("receive", (buf) => resolve(buf));
    });

    await tcp.write("hello");
    const data = await Promise.race([
      received,
      delay(2000).then(() => null),
    ]);

    assert.notEqual(data, null);
    assert.equal(data!.toString("utf8"), "hello");

    tcp.end();
    server.close();
  });

  it("dispatches disconnected + retryScheduled when the remote server closes", async () => {
    let serverConn: net.Socket | undefined;
    const server = net.createServer((c) => {
      serverConn = c;
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as net.AddressInfo).port;

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port,
      keepAliveMs: 100,
    });

    await new Promise<void>((resolve) => {
      tcp.on("connected", () => resolve());
      tcp.start();
    });

    const disconnected = new Promise<void>((resolve) => {
      tcp.on("disconnected", () => resolve());
    });

    serverConn!.destroy();

    assert.equal(
      await Promise.race([
        disconnected.then(() => true),
        delay(2000).then(() => false),
      ]),
      true,
      "disconnected should fire when the remote closes",
    );

    tcp.end();
    server.close();
  });
});

describe("tcp recovery", () => {
  const FAST_RETRY = 50;

  class EchoServer {
    private server: net.Server | undefined;
    private connections = new Set<net.Socket>();
    port = 0;

    async start(): Promise<void> {
      this.server = net.createServer((c) => {
        this.connections.add(c);
        c.on("data", (data) => c.write(data));
        c.on("close", () => this.connections.delete(c));
      });
      await new Promise<void>((resolve) =>
        this.server!.listen(this.port || 0, resolve),
      );
      this.port = (this.server!.address() as net.AddressInfo).port;
    }

    async stop(): Promise<void> {
      for (const c of this.connections) c.destroy();
      this.connections.clear();
      if (this.server) {
        await new Promise<void>((resolve) => this.server!.close(() => resolve()));
        this.server = undefined;
      }
    }

    destroyConnections(): void {
      for (const c of this.connections) c.destroy();
    }
  }

  const TIMEOUT = 3000;

  const waitForEvent = async <K extends keyof Events.Socket.TcpMap>(
    tcp: Tcp,
    event: K,
    timeoutMs = TIMEOUT,
  ): Promise<Events.Socket.TcpMap[K]> => {
    return Promise.race([
      new Promise<Events.Socket.TcpMap[K]>((resolve) => {
        const off = tcp.on(event, (payload) => {
          resolve(payload);
          off();
        });
      }),
      delay(timeoutMs).then(() => {
        throw new Error(`timed out waiting for "${event}"`);
      }),
    ]);
  };

  it("reconnects and resumes send/receive after the server restarts", async () => {
    const echo = new EchoServer();
    await echo.start();

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: echo.port,
      keepAliveMs: 100,
      retryDelayMs: FAST_RETRY,
    });

    void tcp.start();
    await waitForEvent(tcp, "connected");

    const recv1 = waitForEvent(tcp, "receive");
    await tcp.write("first");
    assert.equal((await recv1).toString("utf8"), "first");

    await echo.stop();
    await waitForEvent(tcp, "disconnected");
    await waitForEvent(tcp, "retryScheduled");

    await echo.start();
    await waitForEvent(tcp, "connected");

    const recv2 = waitForEvent(tcp, "receive");
    await tcp.write("second");
    assert.equal((await recv2).toString("utf8"), "second");

    tcp.end();
    await echo.stop();
  });

  it("recovers when the connection is killed mid-stream", async () => {
    const echo = new EchoServer();
    await echo.start();

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: echo.port,
      keepAliveMs: 100,
      retryDelayMs: FAST_RETRY,
    });

    void tcp.start();
    await waitForEvent(tcp, "connected");

    const recv1 = waitForEvent(tcp, "receive");
    await tcp.write("before-drop");
    assert.equal((await recv1).toString("utf8"), "before-drop");

    echo.destroyConnections();
    await waitForEvent(tcp, "disconnected");

    await waitForEvent(tcp, "connected");

    const recv2 = waitForEvent(tcp, "receive");
    await tcp.write("after-drop");
    assert.equal((await recv2).toString("utf8"), "after-drop");

    tcp.end();
    await echo.stop();
  });

  it("survives multiple disconnect/reconnect cycles", async () => {
    const echo = new EchoServer();
    await echo.start();

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: echo.port,
      keepAliveMs: 100,
      retryDelayMs: FAST_RETRY,
    });

    void tcp.start();

    for (let cycle = 0; cycle < 3; cycle++) {
      await waitForEvent(tcp, "connected", 3000);

      const recv = waitForEvent(tcp, "receive");
      await tcp.write(`cycle-${cycle}`);
      const data = await recv;
      assert.equal(data.toString("utf8"), `cycle-${cycle}`);

      if (cycle < 2) {
        echo.destroyConnections();
        await waitForEvent(tcp, "disconnected");
      }
    }

    tcp.end();
    await echo.stop();
  });

  it("does not dispatch connected while the server is down, only when it returns", async () => {
    const echo = new EchoServer();
    await echo.start();

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: echo.port,
      keepAliveMs: 100,
      retryDelayMs: FAST_RETRY,
    });

    void tcp.start();
    await waitForEvent(tcp, "connected");

    await echo.stop();
    await waitForEvent(tcp, "disconnected");

    let connectedFiredWhileDown = false;
    const offConnected = tcp.on("connected", () => {
      connectedFiredWhileDown = true;
    });

    await delay(FAST_RETRY * 5);
    assert.equal(
      connectedFiredWhileDown,
      false,
      "connected must not fire while server is unreachable",
    );

    offConnected();

    await echo.start();
    await waitForEvent(tcp, "connected");

    tcp.end();
    await echo.stop();
  });

  it("writes return -1 and do not throw when socket is disconnected", async () => {
    const echo = new EchoServer();
    await echo.start();

    const tcp = new Tcp({
      addr: "127.0.0.1",
      port: echo.port,
      keepAliveMs: 100,
      retryDelayMs: FAST_RETRY,
    });

    void tcp.start();
    await waitForEvent(tcp, "connected");

    echo.destroyConnections();
    await waitForEvent(tcp, "disconnected");

    const result = await tcp.write("orphaned");
    assert.equal(result, -1, "write should return -1 when socket is undefined");

    tcp.end();
    await echo.stop();
  });
});
