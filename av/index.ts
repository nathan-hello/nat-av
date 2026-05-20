import { bindHttpToWs, WebsocketHandler, type WebSocketApp } from "@av/rpc/server/websocket";
import { AutomationEngine } from "@av/automation";
import { Tcp } from "@av/sockets/tcp";
import { System } from "@av/system";
import { bus } from "@av/bus";
import { RPCServer } from "@av/rpc/server";
import Decoder from "@av/drivers/decoder";
import DisplayManager from "@av/drivers/decoder/impl/display";

import { CustomExporter } from "@av/telemetry/exporters";
import { FileExporter, SimpleConsoleExporter } from "@av/telemetry/server/exporters";
import { StartLogging } from "@av/telemetry/sdk";
import { SchemaGenerator } from "@av/schema";
import Natav from "@av/natav";
import { Telemetry } from "@av/telemetry";

// TSAS:
if ((globalThis as any).__devices__) {
  // TSAS:
  await (globalThis as any).__devices__.End();
}

StartLogging([
  new FileExporter("./logs/natav.jsonl", true),
  new SimpleConsoleExporter(),
  new CustomExporter((event) => {
    bus.dispatch("natav:opentelemetry:entry", {
      type: "natav:opentelemetry:entry",
      message: event,
    });
  }),
]);

export const natav = new Natav([
  new DisplayManager("video-wall", [
    {
      driver: new Decoder({
        name: "decoder-1",
        socket: new Tcp({ addr: "decoder-e8d8d1599092.local", port: 12345, keepAlive: true }),
      }),
      placement: [{ outputId: 0, resX: 1920, resY: 1080, canvasX: 0, canvasY: 0 }],
    },
  ]),
]);

export type natav = typeof natav;

export const schema = new SchemaGenerator({
  entryFile: new URL("./rpc/client/index.ts", import.meta.url),
  exportName: "ClientRpc",
});

const system = new System({
  bus,
  natav,
  schema: schema.toJSON(),
});
new AutomationEngine({ bus, natav });

const rpc = new RPCServer({ system, natav });
const websocket = new WebsocketHandler({ bus, rpc, natav });

export async function start(app: WebSocketApp) {
  bindHttpToWs(app, "/ws", websocket, new Telemetry("Server::Websocket"));

  await natav.Start();
  // TSAS:
  (globalThis as any).__devices__ = natav;
}
