import { router } from "@/router";
import { type Rpc, Telemetry } from "@av/index";
import { start } from "@server/index";
import * as http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import { WebSocketServer } from "ws";

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 44100;

const tel = new Telemetry("server");

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      tel.error("unknown error in router.fetch", { error: error });
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
);

const websocketApp = createWebSocketApp(server);

await start(websocketApp);

await new Promise<void>((resolve) => {
  server.listen(port, resolve);
});

tel.info(`http://localhost:${port}`);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function createWebSocketApp(server: http.Server): Rpc.WebSocket.App {
  const sockets = new Map<string, WebSocketServer>();

  server.on("upgrade", (request, socket, head) => {
    if (!request.url) {
      socket.destroy();
      return;
    }

    const url = new URL(
      request.url,
      `http://${request.headers.host ?? "localhost"}`,
    );
    const wsServer = sockets.get(url.pathname);

    if (!wsServer) {
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit("connection", ws, request);
    });
  });

  return {
    ws(path, handlers) {
      const wsServer = new WebSocketServer({ noServer: true });
      sockets.set(path, wsServer);

      wsServer.on("connection", (ws, conn) => {
        const addr = conn.socket.remoteAddress ?? randomString(16);
        const peer = toWebSocketPeer(ws, addr);
        handlers.open(peer);

        ws.on("message", (message, isBinary) => {
          handlers.message(peer, toArrayBuffer(message), isBinary);
        });

        ws.on("close", (code, reason) => {
          handlers.close(peer, code, toArrayBuffer(reason));
        });

        ws.on("error", () => {
          handlers.error(peer);
        });
      });
    },
  };
}

function toWebSocketPeer(
  ws: {
    readonly readyState: number;
    send(message: string): void;
    close(code?: number, reason?: string): void;
  },
  addr: string,
): Rpc.WebSocket.Peer {
  return {
    addr,
    get readyState() {
      return ws.readyState;
    },
    send(message: string) {
      ws.send(message);
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
  };
}

function toArrayBuffer(
  data: string | Buffer | ArrayBufferLike | Buffer[],
): ArrayBuffer {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).buffer;
  }

  if (Array.isArray(data)) {
    return Uint8Array.from(Buffer.concat(data)).buffer;
  }

  if (ArrayBuffer.isView(data)) {
    return Uint8Array.from(data).buffer;
  }

  return Uint8Array.from(new Uint8Array(data)).buffer;
}

function randomString(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
