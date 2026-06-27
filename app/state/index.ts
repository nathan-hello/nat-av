import { Telemetry } from "@av/client";
import { Client, Rpc, type Drivers } from "@av/index";
import type { natav } from "@server/index";
import type { Handle } from "remix/ui";

Telemetry.Sdk.AddExporters([
  new Telemetry.Exporters.SimpleConsoleExporter("DEBUG"),
]);

const rpcClient = new Client.Rpc<natav>();
await rpcClient.connect();

const subscriptions = new WeakMap<Handle, () => void>();

export function getRpc(handle: Handle<any, any>): Rpc.Client.Handle<natav>;
export function getRpc<N extends Drivers.Names<natav["drivers"]>>(
  handle: Handle<any, any>,
  name: N,
): Rpc.Client.DriverHandle<natav, N>;
export function getRpc<N extends Drivers.Names<natav["drivers"]>>(
  handle: Handle<any, any>,
  name?: N,
): Rpc.Client.Handle<natav> | Rpc.Client.DriverHandle<natav, N> {
  if (subscriptions.has(handle)) {
    return rpcClient;
  }

  const offReady = rpcClient.on("ready", async () => {
    await handle.update();
  });

  const offClose = rpcClient.on("close", async () => {
    await handle.update();
  });

  const offChange = rpcClient.on("change", async (event) => {
    if (name && name === event?.name) {
      await handle.update();
    }
  });

  const cleanup = () => {
    offReady();
    offClose();
    offChange();
    subscriptions.delete(handle);
  };

  subscriptions.set(handle, cleanup);
  handle.signal.addEventListener("abort", cleanup, { once: true });

  if (name) {
    return rpcClient.driver(name);
  } else {
    return rpcClient;
  }
}
