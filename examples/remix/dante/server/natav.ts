import { Natav, RpcServer, Telemetry } from "@nat-av/core";
import DanteRouter from "@nat-av/driver-dante-router";
import { RpcTransportWebsocket } from "@nat-av/rpc-ws";
import type { Server } from "node:http";
import { simulatedDevices } from "@/server/simulated-devices";

Telemetry.Sdk.AddExporters([
  new Telemetry.Server.SimpleConsoleExporter("INFO"),
]);

// Routes between virtual devices so the example runs without Dante hardware.
// To control a real network, remove `simulate`. Devices are then discovered
// with mDNS through avahi-browse. Optionally:
//   interfaceIp: "10.0.0.5",  bind ARC traffic to one network interface
//   liveMdns: true,           rescan when devices join or leave
//   discovery: new StaticDiscovery([{ ipv4: "10.0.0.20" }]),
//                             skip mDNS and query fixed addresses
const dante = new DanteRouter({
  name: "dante",
  liveMdns: true,
  // simulate: simulatedDevices,
});

const natav = new Natav({
  drivers: [dante],
  plugin: [RpcServer],
});

export type natav = typeof natav;

export async function start(server: Server) {
  const websocket = new RpcTransportWebsocket(server);
  natav.plugin["rpc-server"].attachTransport(websocket);

  await natav.Start();

  // Populate the matrix before the first browser connects.
  void dante.api.refresh();

  return async () => {
    await natav.End();
  };
}
