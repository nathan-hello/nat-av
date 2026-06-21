import { Rpc, RpcClient } from "@av/client";
import type { natav } from "@server/index";
import type { Handle } from "remix/ui";

let rpcClient: RpcClient<natav> | null = null;
const subscriptions = new WeakMap<Handle, () => void>();

export function getRpc(handle: Handle): Rpc.Client.Handle<natav> {
  if (!rpcClient) {
    rpcClient = new RpcClient();
    rpcClient.connect();
  }

  if (subscriptions.has(handle)) {
    return rpcClient;
  }

  const offReady = rpcClient.on("ready", async () => {
    await handle.update();
  });

  const offClose = rpcClient.on("close", async () => {
    await handle.update();
  });

  const offChange = rpcClient.on("change", async () => {
    await handle.update();
  });

  const cleanup = () => {
    offReady();
    offClose();
    offChange();
    subscriptions.delete(handle);
  };

  subscriptions.set(handle, cleanup);
  handle.signal.addEventListener("abort", cleanup, { once: true });

  return rpcClient;
}
