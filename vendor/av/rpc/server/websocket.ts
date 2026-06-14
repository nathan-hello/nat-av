import type { Manager } from "@av/drivers";
import { DecodeWebsocketError } from "@av/rpc/errors";
import { RPCErrors, RPCNotification, RPCRequest } from "@av/rpc/protocol";
import { RPCServer } from "@av/rpc/server";
import { Telemetry } from "@av/telemetry";
import { Rpc, type Drivers, type Events } from "@av/types";

const decoder = new TextDecoder();

export type WebSocketApp = {
  ws(
    path: string,
    handlers: {
      open(ws: WebSocketPeer): void;
      message(ws: WebSocketPeer, message: ArrayBuffer, isBinary: boolean): void;
      close(ws: WebSocketPeer, code: number, message: ArrayBuffer): void;
      error(ws: WebSocketPeer): void;
    },
  ): void;
};

export type WebSocketPeer = {
  addr: string;
  readonly readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

function readMessage(data: MessageEvent["data"]): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return String(data);
}

export class WebsocketHandler<N extends Drivers.Array> {
  private clients = new Set<WebSocketPeer>();
  private rpc: RPCServer;
  private natav: Manager<Drivers.Array>;
  private tel = new Telemetry("Server::WS");

  constructor(args: { rpc: RPCServer; natav: Manager<N> }) {
    this.rpc = args.rpc;
    this.natav = args.natav;
    args.natav.bus.on("natav:state:update", (payload) => {
      this.BroadcastEvent("natav:state:update", payload);
    });

    args.natav.bus.on("natav:device:connected", (payload) => {
      this.BroadcastEvent("natav:device:connected", payload);
    });

    args.natav.bus.on("natav:device:disconnected", (payload) => {
      this.BroadcastEvent("natav:device:disconnected", payload);
    });
  }

  BroadcastEvent<E extends keyof Events.Natav.Map<N>>(
    event: E,
    payload: Events.Natav.Map<N>[E],
  ) {
    const notification = new RPCNotification(Rpc.Methods.Notification, {
      type: event,
      ...payload,
    });
    this.broadcast(JSON.stringify(notification));
  }

  private broadcast(message: string) {
    this.clients.forEach((c) => {
      if (c.readyState !== 1) {
        return;
      }

      c.send(message);
    });
  }

  WsOpenHandler = (_: Event, peer: WebSocketPeer) => {
    this.clients.add(peer);
    this.pushInitialDeviceStates(peer);
  };

  WsCloseHandler = (_: CloseEvent, peer: WebSocketPeer) => {
    this.clients.delete(peer);
    this.closePeer(peer);
  };

  WsMessageHandler = async (event: MessageEvent, peer: WebSocketPeer) => {
    const message = this.tel.task("WS_MSG_JSON_PARSE", () => {
      return JSON.parse(readMessage(event.data));
    });

    if (!message.ok) {
      peer.send(JSON.stringify(RPCErrors.JsonParse()));
    }

    const req = RPCRequest.is(message.data);

    if (!req) {
      peer.send(
        JSON.stringify(
          RPCErrors.RequestInvalid(
            "id" in message.data ? message.data.id : null,
            message.data,
          ),
        ),
      );
      return;
    }
    const response = await this.rpc.handleRequest(req, peer);

    peer.send(JSON.stringify(response));
  };

  WsErrorHandler = (_: Event, __: WebSocketPeer) => {};

  closePeer(peer: WebSocketPeer) {
    this.rpc.closePeer(peer);
  }

  private pushInitialDeviceStates(ws: WebSocketPeer) {
    for (const name of this.natav.GetAllDriverNames()) {
      let notification = new RPCNotification(Rpc.Methods.Notification, {
        type: "natav:state:update",
        name,
        data: this.natav.GetDriverState(name),
      });

      ws.send(JSON.stringify(notification));
    }
  }
}

export function bindHttpToWs<N extends Drivers.Array>(
  app: WebSocketApp,
  path: string,
  handlers: Pick<
    WebsocketHandler<N>,
    "WsOpenHandler" | "WsMessageHandler" | "WsCloseHandler" | "WsErrorHandler"
  >,
  tel: Telemetry,
) {
  const connections = new Set<WebSocketPeer>();

  app.ws(path, {
    open(peer) {
      connections.add(peer);
      handlers.WsOpenHandler(new Event("open"), peer);
    },
    message(peer, message, isBinary) {
      handlers.WsMessageHandler(
        new MessageEvent("message", {
          data: isBinary ? message : decoder.decode(message),
        }),
        peer,
      );
    },
    close(peer, code, message) {
      connections.delete(peer);

      tel.info("websocket closed", {
        code,
        meaning: DecodeWebsocketError(code),
        reason: decoder.decode(message),
      });

      handlers.WsCloseHandler(
        new CloseEvent("close", {
          code,
          reason: decoder.decode(message),
        }),
        peer,
      );
    },
    error(peer) {
      handlers.WsErrorHandler(new Event("error"), peer);
    },
  });
}
