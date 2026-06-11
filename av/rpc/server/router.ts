import { RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import { RPCErrorCodes } from "@av/rpc/protocol";
import type { Events, Natav } from "@av/types";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { WebSocketPeer } from "@av/rpc/server/websocket";

export interface RPCRequestHandler<N extends Natav.Orch = Natav.Orch> {
  prefix: string;
  on<K extends keyof Events.System.Map<N>>(
    type: K & string,
    handler: (payload: Events.System.Map<N>[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  handle(message: RPCRequest, peer: WebSocketPeer): Promise<RPCResponse | RPCError>;
}

export class RPCRequestRouter<N extends Natav.Orch> extends TypedEventTarget<
  Events.System.Map<N>
> {
  constructor(private handlers: RPCRequestHandler<N>[]) {
    super();

    handlers.forEach((h) => {
      h.on("natav:device:event", (args) => {
        this.dispatch("natav:device:event", args);
      });
    });
  }

  async handle(message: RPCRequest, peer: WebSocketPeer): Promise<RPCResponse | RPCError> {
    const handler = this.handlers.find((candidate) =>
      message.method.startsWith(candidate.prefix),
    );
    if (!handler) {
      return new RPCError(message.id, {
        code: RPCErrorCodes.MethodNotFound,
        message: message.method,
      });
    }

    return handler.handle(message, peer);
  }
}
