import {
  RpcClient,
  Telemetry,
  type Natav,
  type Rpc,
} from "@nat-av/core/client";
import type { Handle } from "remix/ui";

export async function createRpcBinding<N extends Natav = Natav>() {
  Telemetry.Sdk.AddExporters([
    new Telemetry.Exporters.SimpleConsoleExporter("DEBUG"),
  ]);

  const rpcClient = new RpcClient<N>();
  await rpcClient.connect();

  const subscriptions = new WeakMap<Handle, () => void>();

  function getRpc(handle: Handle<any, any>): Rpc.Client.Handle<N>;
  function getRpc<Name extends Natav.Names<N["drivers"]>>(
    handle: Handle<any, any>,
    name: Name,
  ): Rpc.Proxy<Natav.FromName<N["drivers"], Name>>;
  function getRpc<Name extends Natav.Names<N["plugins"]>>(
    handle: Handle<any, any>,
    name: Name,
  ): Rpc.Proxy<Natav.FromName<N["plugins"], Name>>;
  function getRpc<Name extends string>(
    handle: Handle<any, any>,
    name?: Name,
  ):
    | Rpc.Client.Handle<N>
     | Rpc.Proxy<Natav.FromName<N["drivers"], Name & Natav.Names<N["drivers"]>>>
     | Rpc.Proxy<Natav.FromName<N["plugins"], Name & Natav.Names<N["plugins"]>>> {
    if (subscriptions.has(handle)) {
      if (!name) return rpcClient;
      // TSAS: This overload accepts managed driver names, not slash-prefixed group paths.
      return rpcClient.driver(name as Natav.Names<N["drivers"]>) as
        Rpc.Proxy<Natav.FromName<N["drivers"], Name & Natav.Names<N["drivers"]>>>;
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

    if (!name) return rpcClient;
    // TSAS: This overload accepts managed driver names, not slash-prefixed group paths.
    return rpcClient.driver(name as Natav.Names<N["drivers"]>) as
      Rpc.Proxy<Natav.FromName<N["drivers"], Name & Natav.Names<N["drivers"]>>>;
  }

  return { client: rpcClient, getRpc };
}
