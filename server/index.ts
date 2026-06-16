import { Builtin, Manager, Server, Telemetry, type Rpc } from "@av/index";
import Decoder from "@drivers/decoder";
import DisplayManager from "@drivers/decoder/display";
import ChazyControl from "@drivers/turtle";
import { System } from "@server/system";

// TSAS:
if ((globalThis as any).__devices__) {
  // TSAS:
  await (globalThis as any).__devices__.End();
}

Telemetry.Sdk.AddExporters([
  new Telemetry.Server.FileExporter("./logs/natav.jsonl", true, "DEBUG"),
  new Telemetry.Server.SimpleConsoleExporter("DEBUG"),
]);

const chazy = new ChazyControl({
  name: "ChazyControl",
  socket: new Builtin.Sockets.Tcp({
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
        socket: new Builtin.Sockets.Tcp({
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

const deferred = [Builtin.Drivers.Debugger, System] as const;

export type deferred = typeof deferred;

const natav = new Manager({
  drivers,
  deferred,
});

Telemetry.Sdk.AddExporters([
  new Telemetry.Exporters.CustomExporter((event) => {
    natav.bus.dispatch("natav:opentelemetry:entry", event);
  }),
]);

export type natav = (typeof natav)["configs"];

export async function start(app: Rpc.WebSocket.App) {
  const websocket = new Server.Websocket(app);
  new Server.Rpc({ natav, transport: websocket });

  await natav.Start();
  // TSAS:
  (globalThis as any).__devices__ = natav;
}
