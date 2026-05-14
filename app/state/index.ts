import { ClientRpc } from "@av/rpc/client";
import type { Handle } from "remix/ui";

let rpcClient: ClientRpc | null = null;

export function getRpc(handle: Handle<any, any>): ClientRpc {
  if (!rpcClient) {
    rpcClient = new ClientRpc();
    rpcClient.connect();
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

  handle.signal.addEventListener("abort", () => {
    offReady();
    offClose();
    offChange();
  });

  return rpcClient;
}
