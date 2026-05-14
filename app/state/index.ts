import { ClientRpc } from "@av/rpc/client";
import type { Handle } from "remix/ui";

let rpcClient: ClientRpc | null = null;

export function getRpc(handle: Handle<any, any>): ClientRpc {
  if (!rpcClient) {
    rpcClient = new ClientRpc();
    rpcClient.connect();

    const offReady = rpcClient.on("ready", () => {
      handle.update();
    });

    const offClose = rpcClient.on("close", () => {
      handle.update();
    });

    const offChange = rpcClient.on("change", handle.update);

    handle.signal.addEventListener("abort", () => {
      offReady();
      offClose();
      offChange();
    });
  }

  return rpcClient;
}
