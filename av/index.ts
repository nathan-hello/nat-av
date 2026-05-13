import { bindHttpToWs, WebsocketHandler, type WebSocketApp } from "./websocket";
import { AutomationEngine } from "@av/automation";
import { Tcp } from "@av/sockets/tcp";
import { System } from "@av/system";
import { bus } from "@av/bus";
import { RPCHandler } from "@av/rpc/handler";
import Decoder from "@av/drivers/decoder";
import DisplayManager from "@av/drivers/decoder/impl/display";

import {
  CustomExporter,
  MultiLogExporter,
  FileExporter,
  WebsocketExporter,
} from "@av/tools/telemetry/exporters";
import { SchemaGenerator } from "@av/schema";
import { StartLogging } from "@av/tools/telemetry/sdk";
import Natav from "@av/natav";

if ((globalThis as any).__devices__) {
  await (globalThis as any).__devices__.End();
}

const mock = false;

StartLogging(
  new MultiLogExporter([
    new FileExporter("./logs/otel.log", true),
    new CustomExporter((event) => {
      bus.dispatch("natav:opentelemetry:entry", {
        type: "natav:opentelemetry:entry",
        message: event,
      });
    }),
  ]),
);

export const natav = new Natav([
  new DisplayManager("video-wall", [
    {
      decoder: new Decoder({
        name: "decoder-1",
        socket: new Tcp({ addr: "decoder-e8d8d1599092.local", port: 12345 }),
      }),
      placement: [{ outputId: 0, resX: 1920, resY: 1080, canvasX: 0, canvasY: 0 }],
    },
  ]),
]);

export const schema = new SchemaGenerator({ entryFile: import.meta.url, exportName: "natav" });

export type natav = typeof natav;

const system = new System({ bus, natav });
new AutomationEngine({ bus, natav });

const rpc = new RPCHandler({ system, natav });
const websocket = new WebsocketHandler({ bus, rpc });
const debug = new WebsocketExporter({ bus });

export async function start(app: WebSocketApp) {
  bindHttpToWs(app, "/ws", websocket);
  bindHttpToWs(app, "/debugger", debug);

  await natav.Start();
  (globalThis as any).__devices__ = natav;
}
