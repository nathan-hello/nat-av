import { Manager, Tcp, Telemetry } from "@av/index";
import DanteRouter from "@drivers/dante/router";
import Decoder from "@drivers/decoder";
import DisplayManager from "@drivers/decoder/display";
import { Debugger } from "@drivers/natav/debug";
import { RpcServer } from "@drivers/natav/rpc/server";
import { RpcTransportWebsocket } from "@drivers/natav/rpc/server/websocket";
import { System } from "@server/system";
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
            addr: "decoder-e8d8d1599092.local",
            port: 12345,
            keepAlive: true,
          }),
        }),
      ],
      {
        "decoder-1": [
          { outputId: 0, resX: 1920, resY: 1080, canvasX: 0, canvasY: 0 },
        ],
      },
    ),
    new DanteRouter({ name: "dante", interfaceIp: "10.1.0.6", liveMdns: true }),
  ],
  deferred: [Debugger, System],
});

Telemetry.Sdk.AddExporters([
  new Telemetry.Exporters.CustomExporter((event) => {
    natav.bus.dispatch("natav:opentelemetry:entry", event);
  }),
]);

export type natav = typeof natav;

export async function start(server: Server) {
  const websocket = new RpcTransportWebsocket(server);
  const rpcServer = new RpcServer(natav, websocket);

  await natav.Start();

  rpcServer.start();

  // TSAS:
  (globalThis as any).__manager__ = natav;
  return async () => await natav.End();
}
