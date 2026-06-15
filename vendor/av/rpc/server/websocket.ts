import { TypedEventTarget } from "@av/lib/eventtarget";
import type { Rpc } from "@av/types";

export type ServerRpcTransportEvents = {
  open: { peer: Rpc.WebSocket.Peer };
  message: { peer: Rpc.WebSocket.Peer; data: string };
  close: { peer: Rpc.WebSocket.Peer; code: number; reason: string };
  error: { peer: Rpc.WebSocket.Peer };
};

export type ServerRpcTransport = Pick<
  TypedEventTarget<ServerRpcTransportEvents>,
  "on" | "once"
> & {
  listen(): void;
};

const decoder = new TextDecoder();

export class WebsocketHandler
  extends TypedEventTarget<ServerRpcTransportEvents>
  implements ServerRpcTransport
{
  constructor(
    private app: Rpc.WebSocket.App,
    private path = "/ws",
  ) {
    super();
  }

  listen(): void {
    this.app.ws(this.path, {
      open: (peer) => {
        this.dispatch("open", { peer });
      },
      message: (peer, message, _isBinary) => {
        this.dispatch("message", {
          peer,
          data: decoder.decode(message),
        });
      },
      close: (peer, code, message) => {
        this.dispatch("close", {
          peer,
          code,
          reason: decoder.decode(message),
        });
      },
      error: (peer) => {
        this.dispatch("error", { peer });
      },
    });
  }
}
