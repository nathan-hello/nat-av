import { Manager, Server, Tcp, Telemetry, type Rpc } from "@av/index";
import Decoder from "@drivers/decoder";
import DisplayManager from "@drivers/decoder/display";
import { Debugger } from "@drivers/natav/debug";
import { System } from "@server/system";

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
//
const drivers = [
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
] as const;

export type drivers = typeof drivers;

const deferred = [Debugger, System] as const;

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

export type natav = Manager<drivers, deferred, AppContext>;

type AppContext = {
  addr: string;
  name: string;
};

export async function start(app: Rpc.WebSocket.App) {
  const websocket = new Server.Websocket(app);
  new Server.Rpc<AppContext>({
    natav: natav as Manager<any, any, AppContext>,
    transport: websocket,
    peerToContext: (peer): AppContext => ({
      addr: peer.addr,
      name: peer.addr,
    }),
  });

  await natav.Start();
  // TSAS:
  (globalThis as any).__manager__ = natav;
}
