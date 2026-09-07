import { Manager, Tcp, Telemetry, type Sockets, RpcServer } from "@nat-av/core";
import {
  CiscoRoomOS,
  DanteRouter,
  NatDecoderWall,
  NatDecoder,
  Paint,
  BewinnerRelayBoard,
} from "@nat-av/drivers";
import { Debugger, Schema } from "@nat-av/plugins";
import { RpcTransportWebsocket } from "@nat-av/rpc-ws";
import { Server } from "node:http";
import { System } from "@/server/system";

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
    new NatDecoderWall.default(
      "video-wall",
      [
        new NatDecoder.default({
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
    new CiscoRoomOS.default({
      name: "roomos",
      socket: [] as unknown as Sockets.Client,
      strict: false,
    }),
    new DanteRouter.default({
      name: "dante",
      interfaceIp: "10.1.0.6",
      liveMdns: true,
    }),
    new BewinnerRelayBoard.default({
      name: "relay-board",
      address: "192.168.1.4",
    }),
    new Paint.default({
      outputDir: "./tmp/paint",
      paints: {
        main: { width: 1920, height: 1080 },
      } as const,
    }),
  ],
  deferred: [
    System,
    RpcServer,
    Debugger.default,
    (manager) => new Schema.default(manager, {}),
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
