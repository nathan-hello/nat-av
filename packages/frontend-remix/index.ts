import {
  RpcClient,
  Telemetry,
  type Drivers,
  type Manager,
  type Rpc,
} from "@nat-av/core/client";
import type { Handle } from "remix/ui";

export async function createRpcBinding<N extends Manager = Manager>() {
  Telemetry.Sdk.AddExporters([
    new Telemetry.Exporters.SimpleConsoleExporter("DEBUG"),
  ]);

  const rpcClient = new RpcClient<N>();
  await rpcClient.connect();

  const subscriptions = new WeakMap<Handle, () => void>();

  function getRpc(handle: Handle<any, any>): Rpc.Client.Handle<N>;
  function getRpc<Name extends Drivers.Names<N["drivers"]>>(
    handle: Handle<any, any>,
    name: Name,
  ): Rpc.Client.DriverHandle<N, Name>;
  function getRpc<Name extends Drivers.Names<N["plugins"]>>(
    handle: Handle<any, any>,
    name: Name,
  ): Rpc.Client.PluginHandle<N, Name>;
  function getRpc<Name extends string>(
    handle: Handle<any, any>,
    name?: Name,
  ): Rpc.Client.Handle<N> | Rpc.Client.DriverHandle<N, Name> | Rpc.Client.PluginHandle<N, Name & Drivers.Names<N["plugins"]>> {
    if (subscriptions.has(handle)) {
      return name ? rpcClient.driver(name) : rpcClient;
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

    return name ? rpcClient.driver(name) : rpcClient;
  }

  return { client: rpcClient, getRpc };
}
