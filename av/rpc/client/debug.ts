import { TypedEventTarget } from "@av/lib/eventtarget";
import { ClientWebsocket } from "./websocket";
import type { DebugEntry, DebugEvents } from "@av/rpc/client/types";
import { Telemetry } from "@av/telemetry";

export class ClientRpcDebug extends TypedEventTarget<DebugEvents> {
  private tel: Telemetry;
  private transport;
  private entries: DebugEntry[] = [];
  private connected = false;

  constructor() {
    const tel = new Telemetry("ClientRpcDebug");
    super(tel);
    this.tel = tel;
    this.transport = new ClientWebsocket("/debug", {
      reconnect: true,
      retryDelay: 1000,
    });

    this.transport.on("open", () => {
      this.tel.info("transport-event", { type: "open" });
      this.connected = true;
      super.dispatch("ready", true);
    });

    this.transport.on("close", (event) => {
      this.tel.info("transport-event", { type: "close", reason: event.reason, code: event.code });
      this.connected = false;
      super.dispatch("ready", false);
    });

    this.transport.on("error", (event) => {
      this.tel.error("transport-event", { type: "error" });
      this.dispatch("error", event);
    });

    this.transport.on("message", (event) => {
      this.tel.info("transport-event", { type: "message", data: event.data });
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
    if (typeof raw !== "string") {
      this.tel.error("on-message-got-non-string", { raw, type: typeof raw });
    }

    const parsed = this.tel.task("JSON_PARSE", () => {
      return JSON.parse(raw);
    });
    if (parsed.ok) {
      this.entries = [parsed.data, ...this.entries].slice(0, 500);
      this.dispatch("entry", parsed.data);
      return;
    }

    const err = {
      time: new Date().toISOString().slice(11, 23),
      context: { spanId: undefined, traceId: undefined, traceName: "CLIENT_INTERNAL" },
      severity: { id: 50, text: "ERROR" },
      name: "UNABLE_TO_JSON_PARSE_LOG",
      data: raw,
    };

    this.tel.error("json-parse-failed", { raw, parsed, err });
    this.entries = [err, ...this.entries].slice(0, 500);
    this.dispatch("entry", err);
  }
}
