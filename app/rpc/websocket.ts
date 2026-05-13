import { TypedEventTarget } from "@/rpc/eventtarget";
import type { TransportOptions } from "@/rpc/types";

export class RemixWebsocket extends TypedEventTarget<WebSocketEventMap> {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private closedExplicitly = false;

  constructor(
    private url: string,
    private options: Required<TransportOptions>,
  ) {
    super();
  }

  connect() {
    let socket = new WebSocket(toWebSocketUrl(this.url));
    console.log("ClientWebsocket.openSocket");
    this.socket = socket;

    socket.addEventListener("open", (event) => {
      this.retryCount = 0;
      console.log("ClientWebsocket.openSocket: Event: Open");
      super.emit("open", event);
    });

    socket.addEventListener("message", (event) => {
      super.emit("message", event);
    });

    socket.addEventListener("error", (event) => {
      console.log("ClientWebsocket.openSocket: Event: Error", event);
      super.emit("error", event);
    });

    socket.addEventListener("close", (event) => {
      console.log("ClientWebsocket.openSocket: Event: Close", event);
      super.emit("close", event);
      this.dispatchEvent(new CustomEvent("close", event));

      if (this.closedExplicitly || !this.options.reconnect) {
        return this;
      }

      this.reconnectTimer = setTimeout(
        () => {
          this.retryCount += 1;
          console.log(
            "ClientWebsocket.openSocket: Attempting Reconnect: Attempt ",
            this.retryCount,
          );
          this.connect();
        },
        this.options.retryDelay * Math.min(this.retryCount + 1, 10),
      );
    });
    return this;
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
