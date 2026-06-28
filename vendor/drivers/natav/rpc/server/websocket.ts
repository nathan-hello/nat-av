import { Convert, TypedEventTarget } from "@av/index";
import * as http from "node:http";
import { WebSocketServer } from "ws";
import type { Rpc } from "../types";

export type ServerRpcTransportEvents = {
  open: { peer: Rpc.WebSocket.Peer };
  message: { peer: Rpc.WebSocket.Peer; data: string };
  close: { peer: Rpc.WebSocket.Peer; code: number; reason: string };
  error: { peer: Rpc.WebSocket.Peer };
};

export type ServerRpcTransport = Pick<
  TypedEventTarget<ServerRpcTransportEvents>,
  "on" | "once"
> & {
  listen(): void;
};

const decoder = new TextDecoder();

export class RpcTransportWebsocket
  extends TypedEventTarget<ServerRpcTransportEvents>
  implements ServerRpcTransport
{
  private app: Rpc.WebSocket.App;
  constructor(
    app: http.Server,
    private path = "/ws",
  ) {
    super();
    this.app = createWebSocketApp(app);
  }

  listen(): void {
    this.app.ws(this.path, {
      open: (peer) => {
        this.dispatch("open", { peer });
      },
      message: (peer, message, _isBinary) => {
        this.dispatch("message", {
          peer,
          data: decoder.decode(message),
        });
      },
      close: (peer, code, message) => {
        this.dispatch("close", {
          peer,
          code,
          reason: decoder.decode(message),
        });
      },
      error: (peer) => {
        this.dispatch("error", { peer });
      },
    });
  }
}

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
          handlers.message(peer, Convert.toArrayBuffer(message), isBinary);
        });

        ws.on("close", (code, reason) => {
          handlers.close(peer, code, Convert.toArrayBuffer(reason));
        });

        ws.on("error", () => {
          handlers.error(peer);
        });
      });
    },
  };
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
