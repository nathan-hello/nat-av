import Decoder from "@av/drivers/decoder";
import DisplayManager from "@av/drivers/decoder/display";
import { Bus } from "@av/lib/bus";
import { bindDebugHttpToWs, RpcDebugServer } from "@av/rpc/debug/server";
import { RPCServer } from "@av/rpc/server";
import {
  bindHttpToWs,
  WebsocketHandler,
  type WebSocketApp,
} from "@av/rpc/server/websocket";
import { Tcp } from "@av/sockets/tcp";
import { System } from "@server/system";

import { Manager } from "@av/drivers";
import ChazyControl from "@av/drivers/turtle";
import { Telemetry } from "@av/telemetry";
import { CustomExporter } from "@av/telemetry/exporters";
import { StartLogging } from "@av/telemetry/sdk";
import {
  FileExporter,
  SimpleConsoleExporter,
} from "@av/telemetry/server/exporters";

const bus = new Bus();

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

const chazy = new ChazyControl({
  name: "ChazyControl",
  socket: new Tcp({
    bus,
    addr: "controller.local",
    port: 23,
    keepAlive: true,
  }),
});

const drivers = [
  new DisplayManager("video-wall", [
    {
      driver: new Decoder({
        name: "decoder-1",
        socket: new Tcp({
          bus,
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
  chazy,
];

const natav = new Manager({
  bus,
  drivers,
  deferred: [System],
});

export type drivers = typeof drivers;
export type natav = typeof natav["configs"];

const rpc = new RPCServer({ natav });
const debug = new RpcDebugServer({ natav });

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
