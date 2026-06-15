import { TypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import { Rpc } from "@av/types";

export type ClientRpcTransport = Pick<
  TypedEventTarget<WebSocketEventMap>,
  "on" | "once"
> & {
  connect(): void;
  close(code?: number, reason?: string): void;
  send(message: string): void;
  readonly readyState: number;
};

export class ClientWebsocket
  extends TypedEventTarget<WebSocketEventMap>
  implements ClientRpcTransport
{
  private tel = new Telemetry("ClientWebsocket");
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private closedExplicitly = false;

  constructor(
    private url: string,
    private options: Required<Rpc.WebSocket.TransportOptions>,
  ) {
    super();
  }

  connect() {
    let socket = new WebSocket(toWebSocketUrl(this.url));
    this.tel.info("made new websocket", { url: this.url });
    this.socket = socket;

    socket.addEventListener("open", (event) => {
      this.retryCount = 0;
      this.tel.info("got event", { event: "open" });
      this.dispatch("open", event);
    });

    socket.addEventListener("message", (event) => {
      this.tel.info("got event", { event: "message", data: event.data });
      this.dispatch("message", event);
    });

    socket.addEventListener("error", (event) => {
      this.tel.info("got event", { event: "error", error: event });
      this.dispatch("error", event);
    });

    socket.addEventListener("close", (event) => {
      this.tel.info("got event", {
        event: "close",
        reason: event.reason,
        code: event.code,
      });
      this.dispatch("close", event);

      if (this.closedExplicitly || !this.options.reconnect) {
        return;
      }

      this.reconnectTimer = setTimeout(
        () => {
          this.retryCount += 1;
          this.tel.error("reconnecting", { retryCount: this.retryCount });
          this.connect();
        },
        this.options.retryDelay * Math.min(this.retryCount + 1, 10),
      );
    });
  }

  close(code?: number, reason?: string) {
    this.closedExplicitly = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close(code, reason);
  }

  send(message: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.socket.send(message);
  }

  get readyState() {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }
}

function toWebSocketUrl(url: string) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  let resolved = new URL(url, window.location.href);
  resolved.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return resolved.toString();
}
