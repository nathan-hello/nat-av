import {
  bindHttpToWs,
  WebsocketHandler,
  type WebSocketApp,
} from "@av/rpc/server/websocket";
import { bindDebugHttpToWs, RpcDebugServer } from "@av/rpc/debug/server";
import { Tcp } from "@av/sockets/tcp";
import { System } from "@av/system";
import { bus } from "@av/lib/bus";
import { RPCServer } from "@av/rpc/server";
import Decoder from "@av/drivers/decoder";
import DisplayManager from "@av/drivers/decoder/display";

import { CustomExporter } from "@av/telemetry/exporters";
import {
  FileExporter,
  SimpleConsoleExporter,
} from "@av/telemetry/server/exporters";
import { StartLogging } from "@av/telemetry/sdk";
import { Orchistrator } from "@av/lib/orch";
import { Telemetry } from "@av/telemetry";
import ChazyControl from "@av/drivers/turtle";

// TSAS:
if ((globalThis as any).__devices__) {
  // TSAS:
  await (globalThis as any).__devices__.End();
}

StartLogging([
  new FileExporter("./logs/natav.jsonl", true, "DEBUG"),
  new SimpleConsoleExporter("DEBUG"),
  new CustomExporter((event) => {
    bus.dispatch("natav:opentelemetry:entry", event);
  }),
]);

const natav = new Orchistrator([
  new DisplayManager("video-wall", [
    {
      driver: new Decoder({
        name: "decoder-1",
        socket: new Tcp({
          addr: "127.0.0.1",
          port: 12345,
          keepAlive: true,
        }),
      }),
      placement: [
        { outputId: 0, resX: 1920, resY: 1080, canvasX: 0, canvasY: 0 },
      ],
    },
  ]),
  // new ChazyControl({
  //   name: "ChazyControl",
  //   socket: new Tcp({ addr: "controller.local", port: 23, keepAlive: true }),
  // }),
]);

export type natav = typeof natav;

const system = new System({ natav });

const rpc = new RPCServer({ system, natav });
const debug = new RpcDebugServer({ system, natav });

const websocket = new WebsocketHandler({ rpc, natav });

export async function start(app: WebSocketApp) {
  bindHttpToWs(app, "/ws", websocket, new Telemetry("Server::Websocket"));
  bindDebugHttpToWs(
    app,
    "/debug/ws",
    debug,
    new Telemetry("Server::DebugWebsocket"),
  );

  await natav.Start();
  // TSAS:
  (globalThis as any).__devices__ = natav;
}
