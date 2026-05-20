import type { Bus } from "@av/bus";
import type Natav from "@av/natav";
import type { natav } from "@av/index";
import {
  DebugRpcMethods,
  type DebugDeviceNode,
  type DebugRpcNotification,
  type DebugSocketEvent,
  type DebugSocketMessage,
  type DebugSocketWriteResult,
  type SocketDebugEncoding,
} from "@av/rpc/debug/types";
import { RPCError, RPCErrorCodes, RPCNotification, type RPCRequest, RPCResponse, RPCErrors } from "@av/rpc/protocol";
import { DecodeWebsocketError, isRPCRequest } from "@av/rpc/utils";
import { Telemetry } from "@av/telemetry";
import { ReadableLogRecordToLogEntry } from "@av/telemetry/types";

const decoder = new TextDecoder();

type WebSocketPeer = {
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

export interface DebugWebSocketConnection {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

type WebSocketApp = {
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

function readMessage(data: MessageEvent["data"]): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return String(data);
}

export class RpcDebugServer<N extends Natav = natav> {
  private clients = new Set<DebugWebSocketConnection>();
  private tel = new Telemetry("Server::WS::Debug");

  constructor(
    private args: { bus: Bus; natav: N },
  ) {
    this.args.bus.on("natav:opentelemetry:entry", (payload) => {
      this.broadcastNotification({
        type: "debug:log",
        entry: ReadableLogRecordToLogEntry(payload.message.record),
      });
    });

    this.args.bus.on("natav:debug:socket", (payload) => {
      for (const message of this.resolveSocketMessages(payload.message)) {
        this.broadcastNotification({
          type: "debug:socket:message",
          message,
        });
      }
    });
  }

  WsOpenHandler = (_: Event, ws: DebugWebSocketConnection) => {
    this.clients.add(ws);
  };

  WsCloseHandler = (_: CloseEvent, ws: DebugWebSocketConnection) => {
    this.clients.delete(ws);
  };

  WsErrorHandler = (_: Event, __: DebugWebSocketConnection) => {};

  WsMessageHandler = async (event: MessageEvent, ws: DebugWebSocketConnection) => {
    const message = this.tel.task("DEBUG_WS_MSG_JSON_PARSE", () => {
      return JSON.parse(readMessage(event.data));
    });

    if (!message.ok) {
      ws.send(JSON.stringify(RPCErrors.JsonParse()));
      return;
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

    ws.send(JSON.stringify(await this.handleRequest(req)));
  };

  private async handleRequest(message: RPCRequest): Promise<RPCResponse | RPCError> {
    switch (message.method) {
      case DebugRpcMethods.GetTree:
        return new RPCResponse(message.id, this.args.natav.GetDebugTree());
      case DebugRpcMethods.WriteSocket:
        return await this.handleSocketWrite(message);
      default:
        return new RPCError(message.id, {
          code: RPCErrorCodes.MethodNotFound,
          message: `Unknown debug method: \"${message.method}\"`,
        });
    }
  }

  private async handleSocketWrite(message: RPCRequest): Promise<RPCResponse<DebugSocketWriteResult> | RPCError> {
    if (!message.params || typeof message.params !== "object") {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Invalid debug socket write params",
      });
    }

    const params = message.params as {
      deviceName?: unknown;
      text?: unknown;
      encoding?: unknown;
    };

    if (typeof params.deviceName !== "string" || typeof params.text !== "string") {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InvalidParams,
        message: "Debug socket write requires string deviceName and text",
      });
    }

    const encoding = params.encoding === "utf8" ? params.encoding : "utf8";
    const device = this.args.natav.FindDriver(params.deviceName);
    if (!device) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.DeviceNotFound,
        message: `Device \"${params.deviceName}\" not found`,
        data: { availableDevices: this.args.natav.GetAllDriverNames() },
      });
    }

    if (typeof device.socket?.write !== "function") {
      return new RPCError(message.id, {
        code: RPCErrorCodes.MethodNotFound,
        message: `Device \"${params.deviceName}\" does not expose a writable socket`,
      });
    }

    try {
      const bytesWritten = await device.socket.write(Buffer.from(params.text, encoding as SocketDebugEncoding));
      return new RPCResponse(message.id, { bytesWritten });
    } catch (error) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.InternalError,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private broadcastNotification(notification: DebugRpcNotification) {
    const message = JSON.stringify(new RPCNotification(notification));

    this.clients.forEach((client) => {
      if (client.readyState !== 1) {
        return;
      }

      client.send(message);
    });
  }

  private resolveSocketMessages(event: DebugSocketEvent): DebugSocketMessage[] {
    const messages: DebugSocketMessage[] = [];

    const visit = (node: DebugDeviceNode) => {
      if (node.socket?.traceName === event.traceName) {
        messages.push({
          device: node.name,
          direction: event.direction,
          time: event.time,
          traceName: event.traceName,
          encoding: event.encoding,
          text: event.text,
          hex: event.hex,
          length: event.length,
        });
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of this.args.natav.GetDebugTree()) {
      visit(node);
    }

    return messages;
  }
}

function toWebSocketConnection(ws: WebSocketPeer): DebugWebSocketConnection {
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

export function bindDebugHttpToWs(
  app: WebSocketApp,
  path: string,
  handlers: Pick<RpcDebugServer, "WsOpenHandler" | "WsMessageHandler" | "WsCloseHandler" | "WsErrorHandler">,
  tel: Telemetry,
) {
  const connections = new WeakMap<object, DebugWebSocketConnection>();

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

      tel.info("debug websocket closed", {
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
