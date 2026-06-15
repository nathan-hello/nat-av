import { Manager } from "@av/drivers";
import { Debugger } from "@av/drivers/builtin/debug";
import { RPCServer } from "@av/rpc/server";
import { bindHttpToWs, WebsocketHandler } from "@av/rpc/server/websocket";
import { Tcp } from "@av/sockets/tcp";
import { Telemetry } from "@av/telemetry";
import { CustomExporter } from "@av/telemetry/exporters";
import { AddExporters } from "@av/telemetry/sdk";
import {
  FileExporter,
  SimpleConsoleExporter,
} from "@av/telemetry/server/exporters";
import type { Drivers, Rpc } from "@av/types";
import Decoder from "@drivers/decoder";
import DisplayManager from "@drivers/decoder/display";
import ChazyControl from "@drivers/turtle";
import { System } from "@server/system";

// TSAS:
if ((globalThis as any).__devices__) {
  // TSAS:
  await (globalThis as any).__devices__.End();
}

AddExporters([
  new FileExporter("./logs/natav.jsonl", true, "DEBUG"),
  new SimpleConsoleExporter("DEBUG"),
]);

const chazy = new ChazyControl({
  name: "ChazyControl",
  socket: new Tcp({
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

export type drivers = typeof drivers;

const deferred = [
  (natav: Drivers.ManagerView) => new Debugger(natav),
  (natav: Drivers.ManagerView<drivers>) => new System(natav),
] as const;

export type deferred = typeof deferred;

const natav = new Manager({
  drivers,
  deferred,
});

AddExporters([
  new CustomExporter((event) => {
    natav.bus.dispatch("natav:opentelemetry:entry", event);
  }),
]);

export type natav = (typeof natav)["configs"];

const rpc = new RPCServer({ natav });

const websocket = new WebsocketHandler({ rpc, natav });

export async function start(app: Rpc.WebSocket.App) {
  bindHttpToWs(app, "/ws", websocket, new Telemetry("Server::Websocket"));

  await natav.Start();
  // TSAS:
  (globalThis as any).__devices__ = natav;
}
