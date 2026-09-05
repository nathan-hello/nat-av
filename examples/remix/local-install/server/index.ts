import { Manager, Tcp, Telemetry, type Sockets } from "@nat-av/core";
import { CiscoRoomOS } from "@nat-av/driver-cisco-roomos";
import DanteRouter from "@nat-av/driver-dante-router";
import Decoder from "@nat-av/driver-decoder";
import DisplayManager from "@nat-av/driver-decoder/display";
import { Debugger } from "@nat-av/plugin-debugger";
import { Paint } from "@nat-av/driver-paint";
import { RpcServer } from "@nat-av/core/rpc/server";
import { RpcTransportWebsocket } from "../../rpc-websocket";
import { SchemaGenerator } from "@nat-av/plugin-schema";
import RelayBoard from "@nat-av/driver-bewinner-relay-board";
import { Server } from "node:http";

// TSAS:
if ((globalThis as any).__manager__) {
  // TSAS:
  await (globalThis as any).__manager__.End();
}

Telemetry.Sdk.AddExporters([
  new Telemetry.Server.FileExporter("./logs/natav.jsonl", true, "DEBUG"),
  new Telemetry.Server.SimpleConsoleExporter("DEBUG"),
]);

// const chazy = new ChazyControl({
//   name: "ChazyControl",
//   socket: new Builtin.Sockets.Tcp({
//     addr: "controller.local",
//     port: 23,
//     keepAlive: true,
//   }),
// });

const natav = new Manager({
  drivers: [
    new DisplayManager(
      "video-wall",
      [
        new Decoder({
          name: "decoder-1",
          socket: new Tcp({
            addr: "decoder-0c7a1566cf92.local",
            port: 12345,
            keepAliveMs: 10000,
          }),
        }),
      ],
      {
        "decoder-1": [
          { outputId: 0, resX: 1920, resY: 1080, canvasX: 0, canvasY: 0 },
        ],
      },
    ),
    new CiscoRoomOS({
      name: "roomos",
      socket: [] as unknown as Sockets.Client,
      strict: false,
    }),
    new DanteRouter({ name: "dante", interfaceIp: "10.1.0.6", liveMdns: true }),
    new RelayBoard({ name: "relay-board", address: "192.168.1.4" }),
    new Paint({
      outputDir: "./tmp/paint",
      paints: {
        main: { width: 1920, height: 1080 },
      } as const,
    }),
  ],
  deferred: [
    RpcServer,
    Debugger,
    (manager) => new SchemaGenerator(manager, {}),
  ],
});

Telemetry.Sdk.AddExporters([
  new Telemetry.Exporters.CustomExporter((event) => {
    natav.bus.dispatch("natav:opentelemetry:entry", event);
  }),
]);

export type natav = typeof natav;

export async function start(server: Server) {
  const websocket = new RpcTransportWebsocket(server);
  natav.GetDriver("rpc-server").attachTransport(websocket);

  await natav.Start();

  // TSAS:
  (globalThis as any).__manager__ = natav;
  return async () => await natav.End();
}
