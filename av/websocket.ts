import type { WSContext, WSMessageReceive } from "hono/ws";
import { type EventName, type EventPayload, type Bus } from "./bus";
import type Natav from "@av/natav";
import { RPCHandler } from "@av/rpc/handler";
import { createRPCNotification, isRPCRequest } from "@av/rpc/utils";

export class WebsocketHandler<N extends Natav = Natav> {
  private clients = new Set<WSContext>();
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

  WsOpenHandler = (_: Event, ws: WSContext) => {
    this.clients.add(ws);
  };

  WsCloseHandler = (_: CloseEvent, ws: WSContext) => {
    this.clients.delete(ws);
  };

  WsMessageHandler = async (event: MessageEvent<WSMessageReceive>, ws: WSContext) => {
    const data = event.data.toString();
    try {
      const message = JSON.parse(data);

      // Check if this is an RPC request
      if (isRPCRequest(message)) {
        const response = await this.rpc.handleRequest(message);

        const resp = JSON.stringify(response);
        ws.send(resp);
        return;
      }

      // TODO: huh?
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

  WsErrorHandler = (_: Event, __: WSContext) => {};
}
