import { TypedEventTarget } from "@/rpc/eventtarget";
import { RemixWebsocket } from "./websocket";
import type { DebugEntry, DebugEvents } from "@/rpc/types";

export class DebugClient extends TypedEventTarget<DebugEvents> {
  private transport;
  private entries: DebugEntry[] = [];
  private connected = false;

  constructor() {
    super();
    this.transport = new RemixWebsocket("/debug", {
      reconnect: true,
      retryDelay: 1000,
    });

    this.transport.on("open", () => {
      this.connected = true;
      this.dispatchEvent(new Event("ready"));
    });

    this.transport.on("close", (event) => {
      this.connected = false;
      this.dispatchEvent(event);
    });

    this.transport.on("error", (event) => {
      this.dispatchEvent(event);
    });

    this.transport.on("message", (event) => {
      this.onMessage(event.data);
    });
  }

  connect() {
    this.transport.connect();
    return this;
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
    return this;
  }

  get readyState() {
    return this.transport.readyState;
  }

  get isConnected() {
    return this.connected;
  }

  get logs() {
    return this.entries;
  }

  clear() {
    this.entries = [];
  }

  private onMessage(raw: string) {
    let entry: DebugEntry;
    try {
      entry = JSON.parse(raw);
    } catch {
      entry = {
        time: new Date().toISOString().slice(11, 23),
        context: { spanId: undefined, traceId: undefined, traceName: "CLIENT_INTERNAL" },
        severity: { id: 50, text: "ERROR" },
        name: "UNABLE_TO_JSON_PARSE_LOG",
        data: raw,
      };
    }

    this.entries = [entry, ...this.entries].slice(0, 500);
    this.dispatchEvent(new CustomEvent("entry", { detail: entry }));
  }
}
