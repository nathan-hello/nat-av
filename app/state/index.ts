import type { drivers } from "@server/index";
import { ClientRpc } from "@av/rpc/client";
import type { Handle } from "remix/ui";

let rpcClient: ClientRpc<drivers> | null = null;
const subscriptions = new WeakMap<Handle<any, any>, () => void>();

export function getRpc(handle: Handle<any, any>): ClientRpc<drivers> {
  if (!rpcClient) {
    rpcClient = new ClientRpc();
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

  const offDebugReady = rpcClient.debug.on("ready", async () => {
    await handle.update();
  });

  const offDebugClose = rpcClient.debug.on("close", async () => {
    await handle.update();
  });

  const offDebugChange = rpcClient.debug.on("change", async () => {
    await handle.update();
  });

  const cleanup = () => {
    offReady();
    offClose();
    offChange();
    offDebugReady();
    offDebugClose();
    offDebugChange();
    subscriptions.delete(handle);
  };

  subscriptions.set(handle, cleanup);
  handle.signal.addEventListener("abort", cleanup, { once: true });

  return rpcClient;
}
