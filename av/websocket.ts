import { type EventName, type EventPayload, type Bus } from "./bus";
import type Natav from "@av/natav";
import { RPCHandler } from "@av/rpc/handler";
import { createRPCNotification, isRPCRequest } from "@av/rpc/utils";

export interface WebSocketConnection {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

function readMessage(data: MessageEvent["data"]): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

export class WebsocketHandler<N extends Natav = Natav> {
  private clients = new Set<WebSocketConnection>();
  private rpc: RPCHandler<N>;
  private bus: Bus;

  constructor(args: { bus: Bus; rpc: RPCHandler<N> }) {
    this.bus = args.bus;
    this.rpc = args.rpc;
    this.bus.on("natav:state:update", (payload) => {
      this.BroadcastEvent("natav:state:update", payload);
    });

    this.bus.on("natav:device:connected", (payload) => {
      this.BroadcastEvent("natav:device:connected", payload);
    });

    this.bus.on("natav:device:disconnected", (payload) => {
      this.BroadcastEvent("natav:device:disconnected", payload);
    });

    this.bus.on("natav:automation:triggered", (payload) => {
      this.BroadcastEvent("natav:automation:triggered", payload);
    });
  }

  BroadcastEvent<E extends EventName>(_: E, payload: EventPayload<E>) {
    const notification = createRPCNotification(payload);
    const message = JSON.stringify(notification);

    this.clients.forEach((c) => {
      if (c.readyState !== 1) {
        return;
      }

      c.send(message);
    });
  }

  WsOpenHandler = (_: Event, ws: WebSocketConnection) => {
    this.clients.add(ws);
  };

  WsCloseHandler = (_: CloseEvent, ws: WebSocketConnection) => {
    this.clients.delete(ws);
  };

  WsMessageHandler = async (event: MessageEvent, ws: WebSocketConnection) => {
    const data = readMessage(event.data);
    try {
      const message = JSON.parse(data);

      if (isRPCRequest(message)) {
        const response = await this.rpc.handleRequest(message);

        ws.send(JSON.stringify(response));
        return;
      }

      this.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(data);
        }
      });
    } catch (error) {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
            data: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  };

  WsErrorHandler = (_: Event, __: WebSocketConnection) => {};
}
