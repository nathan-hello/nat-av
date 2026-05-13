import { ClientRpc } from "@av/rpc/client";
import { ClientRpcDebug } from "@av/rpc/client/debug";
import type { Handle } from "remix/ui";

let rpcClient: ClientRpc | null = null;
let debugRpcClient: ClientRpcDebug | null = null;

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

export function getDebugRpc(handle: Handle<any, any>): ClientRpcDebug {
  if (!debugRpcClient) {
    debugRpcClient = new ClientRpcDebug();
    debugRpcClient.connect();

    const offReady = debugRpcClient.on("ready", () => {
      handle.update();
    });

    const offClose = debugRpcClient.on("close", () => {
      handle.update();
    });

    const offChange = debugRpcClient.on("entry", handle.update);

    handle.signal.addEventListener("abort", () => {
      offReady();
      offClose();
      offChange();
    });
  }

  return debugRpcClient;
}
