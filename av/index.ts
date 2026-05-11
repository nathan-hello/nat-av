import type { TemplatedApp, WebSocket as UwsWebSocket } from "uWebSockets.js";

import { WebsocketHandler, type WebSocketConnection } from "./websocket";

import { AutomationEngine } from "@av/automation";
import { Tcp } from "@av/sockets/tcp";

import { System } from "@av/system";
import { bus } from "@av/bus";
import { RPCHandler } from "@av/rpc/handler";
import Decoder from "@av/drivers/decoder";
import DisplayManager from "@av/drivers/decoder/impl/display";

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import {
  CustomExporter,
  MultiLogExporter,
  PinoLogExporter,
  WebsocketExporter,
} from "@av/tools/telemetry/exporters";
import { StartLogging } from "@av/tools/telemetry/sdk";
import Natav from "@av/natav";

const decoder = new TextDecoder();

if ((globalThis as any).__devices__) {
  await (globalThis as any).__devices__.End();
}

const mock = false;

StartLogging(
  new MultiLogExporter([
    new OTLPLogExporter({ url: "http://localhost:4318/v1/logs" }),
    new PinoLogExporter("./logs/otel.log"),
    new CustomExporter((record) => {
      bus.dispatch("natav:opentelemetry:entry", {
        type: "natav:opentelemetry:entry",
        message: record,
      });
    }),
  ]),
);

export const natav = new Natav([
  new DisplayManager("video-wall", [
    {
      decoder: new Decoder({
        name: "decoder-1",
        socket:
          mock ?
            new Tcp({ addr: "127.0.0.1", port: 12333 })
          : new Tcp({ addr: "decoder-0c7a1566cf92.local", port: 12345 }),
      }),
      placement: [
        { outputId: 1, resX: 2560, resY: 1440, canvasX: 0, canvasY: 0 },
        { outputId: 0, resX: 2560, resY: 1440, canvasX: 2560, canvasY: 0 },
      ],
    },
    {
      decoder: new Decoder({
        name: "decoder-2",
        socket:
          mock ?
            new Tcp({ addr: "127.0.0.1", port: 12334 })
          : new Tcp({ addr: "tv.local", port: 12345 }),
      }),
      placement: [{ outputId: 0, resX: 2560, resY: 1440, canvasX: 5120, canvasY: 0 }],
    },
  ]),
]);

export type natav = typeof natav;

const system = new System({ bus, natav });
new AutomationEngine({ bus, natav });

const rpc = new RPCHandler({ system, natav });
const websocket = new WebsocketHandler({ bus, rpc });
const debug = new WebsocketExporter({ bus });

function toWebSocketConnection(ws: UwsWebSocket<unknown>): WebSocketConnection {
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

function bindWebSocketRoute(
  app: TemplatedApp,
  path: string,
  handlers: Pick<WebsocketHandler, "WsOpenHandler" | "WsMessageHandler" | "WsCloseHandler" | "WsErrorHandler">,
) {
  const connections = new WeakMap<object, WebSocketConnection>();

  app.ws(path, {
    open(ws) {
      const connection = toWebSocketConnection(ws as UwsWebSocket<unknown>);
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

export async function attachNatav(app: TemplatedApp) {
  bindWebSocketRoute(app, "/ws", websocket);
  bindWebSocketRoute(app, "/debugger", debug);

  await natav.Start();
  (globalThis as any).__devices__ = natav;
}
