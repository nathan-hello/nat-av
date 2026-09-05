import type { TypedEventTarget } from "@nat-av/core";
import type { Rpc } from "../types.js";

export type ServerRpcTransportEvents = {
  open: { peer: Rpc.WebSocket.Peer };
  message: { peer: Rpc.WebSocket.Peer; data: string };
  close: { peer: Rpc.WebSocket.Peer; code: number; reason: string };
  error: { peer: Rpc.WebSocket.Peer; error: Error };
};

export type ServerRpcTransport = Pick<
  TypedEventTarget<ServerRpcTransportEvents>,
  "on" | "once"
> & {
  listen(): void;
};
