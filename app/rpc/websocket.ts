type EventMap = Record<string, any>;

export type WebsocketEvents = {
  open: Event;
  close: CloseEvent;
  error: Event;
  message: MessageEvent<string>;
};

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  on<K extends keyof Events & string>(
    type: K,
    handler: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    super.addEventListener(type, handler as EventListener, options);
    return this;
  }

  once<K extends keyof Events & string>(
    type: K,
    options?: { signal?: AbortSignal },
  ): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      let cleanup = () => {};

      let listener = (event: Event) => {
        cleanup();
        resolve(event as Events[K]);
      };

      cleanup = () => {
        super.removeEventListener(type, listener as EventListener);
      };

      if (options?.signal?.aborted) {
        reject(options.signal.reason);
        return;
      }

      options?.signal?.addEventListener(
        "abort",
        () => {
          cleanup();
          reject(options.signal?.reason);
        },
        { once: true },
      );

      super.addEventListener(type, listener as EventListener, { once: true });
    });
  }
}

type TransportOptions = {
  reconnect?: boolean;
  retryDelay?: number;
};

function toWebSocketUrl(url: string) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  if (typeof window === "undefined") {
    throw new Error("WebSocket transport can only be created in the browser");
  }

  let resolved = new URL(url, window.location.href);
  resolved.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return resolved.toString();
}

export class RemixWebsocket extends TypedEventTarget<WebsocketEvents> {
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
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      return this;
    }

    this.closedExplicitly = false;
    this.openSocket();
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

  private openSocket() {
    let socket = new WebSocket(toWebSocketUrl(this.url));
    this.socket = socket;

    socket.addEventListener("open", (event) => {
      this.retryCount = 0;
      this.dispatchEvent(event);
    });

    socket.addEventListener("message", (event) => {
      this.dispatchEvent(event as MessageEvent<string>);
    });

    socket.addEventListener("error", (event) => {
      this.dispatchEvent(event);
    });

    socket.addEventListener("close", (event) => {
      this.dispatchEvent(event);

      if (this.closedExplicitly || !this.options.reconnect) {
        return;
      }

      this.reconnectTimer = setTimeout(() => {
        this.retryCount += 1;
        this.openSocket();
      }, this.options.retryDelay * Math.min(this.retryCount + 1, 10));
    });
  }
}

export function createRemixWebsocket(url: string, options: TransportOptions = {}) {
  return new RemixWebsocket(url, {
    reconnect: options.reconnect ?? true,
    retryDelay: options.retryDelay ?? 1000,
  });
}
