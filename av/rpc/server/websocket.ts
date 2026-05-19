import { type EventName, type EventPayload, type Bus } from "@av/bus";
import type Natav from "@av/natav";
import { RPCErrors, RPCNotification } from "@av/rpc/protocol";
import { RPCServer } from "@av/rpc/server";
import { DecodeWebsocketError, isRPCRequest } from "@av/rpc/utils";
import { Telemetry } from "@av/telemetry";
import { ReadableLogRecordToLogEntry } from "@av/telemetry/types";

const decoder = new TextDecoder();

export type WebSocketApp = {
  ws(
    path: string,
    handlers: {
      open(ws: unknown): void;
      message(ws: unknown, message: ArrayBuffer, isBinary: boolean): void;
      close(ws: unknown, code: number, message: ArrayBuffer): void;
      error(ws: unknown): void;
    },
  ): void;
};

type WebSocketPeer = {
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

export interface WebSocketConnection {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

function readMessage(data: MessageEvent["data"]): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return String(data);
}

export class WebsocketHandler<N extends Natav = Natav> {
  private clients = new Set<WebSocketConnection>();
  private rpc: RPCServer<N>;
  private bus: Bus;
  private natav: N;
  private tel = new Telemetry("Server::WS");

  constructor(args: { bus: Bus; rpc: RPCServer<N>; natav: N }) {
    this.bus = args.bus;
    this.rpc = args.rpc;
    this.natav = args.natav;
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

    this.bus.on("natav:opentelemetry:entry", (payload) => {
      this.BroadcastLog(ReadableLogRecordToLogEntry(payload.message.record));
    });
  }

  BroadcastEvent<E extends EventName>(_: E, payload: EventPayload<E>) {
    const notification = new RPCNotification(payload);
    this.broadcast(JSON.stringify(notification));
  }

  BroadcastLog(entry: unknown) {
    let message = this.tel.task("LOG_STRINGIFY", () => {
      return JSON.stringify(entry);
    });

    if (!message.ok) {
      return;
    }

    this.broadcast(message.data);
  }

  private broadcast(message: string) {
    this.clients.forEach((c) => {
      if (c.readyState !== 1) {
        return;
      }

      c.send(message);
    });
  }

  WsOpenHandler = (_: Event, ws: WebSocketConnection) => {
    this.clients.add(ws);
    this.pushInitialDeviceStates(ws);
  };

  WsCloseHandler = (_: CloseEvent, ws: WebSocketConnection) => {
    this.clients.delete(ws);
  };

  WsMessageHandler = async (event: MessageEvent, ws: WebSocketConnection) => {
    const message = this.tel.task("WS_MSG_JSON_PARSE", () => {
      return JSON.parse(readMessage(event.data));
    });

    if (!message.ok) {
      ws.send(JSON.stringify(RPCErrors.JsonParse()));
    }

    const req = isRPCRequest(message.data);

    if (!req) {
      ws.send(
        JSON.stringify(
          RPCErrors.RequestInvalid("id" in message.data ? message.data.id : null, message.data),
        ),
      );
      return;
    }
    const response = await this.rpc.handleRequest(req);

    ws.send(JSON.stringify(response));
  };

  WsErrorHandler = (_: Event, __: WebSocketConnection) => {};

  private pushInitialDeviceStates(ws: WebSocketConnection) {
    for (const name of this.natav.GetAllDriverNames()) {
      let notification = new RPCNotification({
        type: "natav:state:update",
        name,
        data: this.natav.GetDriverState(name),
      });

      ws.send(JSON.stringify(notification));
    }
  }
}

function toWebSocketConnection(ws: WebSocketPeer): WebSocketConnection {
  return {
    readyState: 1,
    send(message: string) {
      ws.send(message);
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
  };
}

export function bindHttpToWs(
  app: WebSocketApp,
  path: string,
  handlers: Pick<
    WebsocketHandler,
    "WsOpenHandler" | "WsMessageHandler" | "WsCloseHandler" | "WsErrorHandler"
  >,
  tel: Telemetry,
) {
  const connections = new WeakMap<object, WebSocketConnection>();

  app.ws(path, {
    open(ws) {
      const connection = toWebSocketConnection(ws as WebSocketPeer);
      connections.set(ws as object, connection);
      handlers.WsOpenHandler(new Event("open"), connection);
    },
    message(ws, message, isBinary) {
      const connection = connections.get(ws as object);
      if (!connection) return;

      handlers.WsMessageHandler(
        new MessageEvent("message", {
          data: isBinary ? message : decoder.decode(message),
        }),
        connection,
      );
    },
    close(ws, code, message) {
      const connection = connections.get(ws as object);
      if (!connection) return;

      connection.readyState = 3;
      connections.delete(ws as object);

      tel.info("websocket closed", {
        code,
        meaning: DecodeWebsocketError(code),
        reason: decoder.decode(message),
      });

      handlers.WsCloseHandler(
        new CloseEvent("close", {
          code,
          reason: decoder.decode(message),
        }),
        connection,
      );
    },
    error(ws) {
      const connection = connections.get(ws as object);
      if (!connection) return;

      handlers.WsErrorHandler(new Event("error"), connection);
    },
  });
}
