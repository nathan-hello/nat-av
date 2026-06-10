import type { ClientRpc } from "@av/rpc/client";
import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import { ClientWebsocket } from "@av/rpc/client/websocket";
import {
  RPCError,
  RPCNotification,
  RPCRequest,
  RPCResponse,
} from "@av/rpc/protocol";
import { Rpc } from "@av/types";
import { Telemetry } from "@av/telemetry";
import type { LogEntry } from "@av/telemetry/types";

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type RpcDebugEvents = {
  ready: boolean;
  close: CloseEvent;
  error:
    | { reason: "transport"; event: Event }
    | { reason: "init-promises-threw"; error: Error }
    | { reason: "json-parse-failed"; raw: string };
  change: {};
};

export class RpcDebugClient extends ProtectedTypedEventTarget<RpcDebugEvents> {
  readonly rpc: ClientRpc;

  private tel = new Telemetry("Rpc::Debug");
  private transport = new ClientWebsocket("/debug/ws", {
    reconnect: true,
    retryDelay: 1000,
  });
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestIdCounter = 0;
  private timeout = 30000;
  private deviceIndex = new Map<string, Rpc.Debug.Node>();

  public tree: Rpc.Debug.Node[] = [];
  public entries: LogEntry[] = [];
  public socketMessages: Record<string, Rpc.Debug.SocketMessage[]> = {};

  constructor(rpc: ClientRpc) {
    super();
    this.rpc = rpc;

    this.transport.on("open", () => {
      void this.init();
    });

    this.transport.on("close", (event) => {
      this.rejectAllPendingRequests(
        new Error(
          `Debug transport closed${event.reason ? `: ${event.reason}` : ""}`,
        ),
      );
      this.dispatch("close", event);
      this.dispatch("change", {});
    });

    this.transport.on("error", (event) => {
      this.dispatch("error", { reason: "transport", event });
    });

    this.transport.on("message", (event) => {
      this.onMessage(event.data);
    });
  }

  connect() {
    this.transport.connect();
  }

  close(code?: number, reason?: string) {
    this.transport.close(code, reason);
  }

  get isOnline() {
    return this.transport.readyState === WebSocket.OPEN;
  }

  async writeSocket(
    deviceName: string,
    text: string,
    encoding: Rpc.Debug.Encoding = "utf8",
  ) {
    return await this.request(
      new RPCRequest(this.nextRequestId(), Rpc.Debug.Methods.WriteSocket, {
        deviceName,
        text,
        encoding,
      }),
    );
  }

  getDevice(name: string) {
    return this.deviceIndex.get(name);
  }

  getSocketMessages(name: string) {
    return this.socketMessages[name] ?? [];
  }

  getEntriesForDevice(name: string) {
    const traceName = this.deviceIndex.get(name)?.socket?.traceName;
    if (!traceName) {
      return [];
    }

    return this.entries.filter(
      (entry) => entry.context.traceName === traceName,
    );
  }

  clearSocketMessages(name: string) {
    delete this.socketMessages[name];
    this.dispatch("change", {});
  }

  clearEntriesForDevice(name: string) {
    const traceName = this.deviceIndex.get(name)?.socket?.traceName;
    if (!traceName) {
      return;
    }

    this.entries = this.entries.filter(
      (entry) => entry.context.traceName !== traceName,
    );
    delete this.socketMessages[name];
    this.dispatch("change", {});
  }

  private async init() {
    await this.waitForOpen();

    const initial = await this.tel.task("GET_DEBUG_INITIAL_STATE", async () => {
      return await Promise.all([
        this.request<Rpc.Debug.Node[]>(
          new RPCRequest(this.nextRequestId(), Rpc.Debug.Methods.GetTree),
        ),
      ]);
    });

    if (!initial.ok) {
      this.dispatch("error", {
        reason: "init-promises-threw",
        error: new Error(initial.error),
      });
      return;
    }

    const [tree] = initial.data;
    this.applyDebugTree(tree);
    this.dispatch("ready", true);
    this.dispatch("change", {});
  }

  private async waitForOpen() {
    if (this.transport.readyState === WebSocket.OPEN) {
      return;
    }

    await this.transport.once("open");
  }

  private onMessage(raw: string) {
    const parsed = this.tel.task("DEBUG_JSON_PARSE", () => JSON.parse(raw));
    if (!parsed.ok || !parsed.data) {
      this.dispatch("error", { reason: "json-parse-failed", raw });
      return;
    }

    const notification = RPCNotification.is(parsed.data);
    if (notification && isDebugNotification(notification.params)) {
      this.handleNotification(notification.params);
      return;
    }

    const response = RPCResponse.is(parsed.data);
    if (response) {
      this.resolvePendingRequest(response.id, response.result);
      return;
    }

    const error = RPCError.is(parsed.data);
    if (error && error.id !== null) {
      this.rejectPendingRequest(error.id, new Error(error.error.message));
    }
  }

  private handleNotification(notification: Rpc.Debug.Notification) {
    switch (notification.type) {
      case "debug:log":
        this.entries = [notification.entry, ...this.entries].slice(0, 500);
        this.dispatch("change", {});
        return;
      case "debug:socket:message":
        this.socketMessages[notification.message.device] = [
          notification.message,
          ...(this.socketMessages[notification.message.device] ?? []),
        ].slice(0, 200);
        this.dispatch("change", {});
        return;
    }
  }

  private applyDebugTree(tree: Rpc.Debug.Node[]) {
    this.tree = tree;
    this.deviceIndex = new Map();

    const visit = (node: Rpc.Debug.Node) => {
      this.deviceIndex.set(node.name, node);

      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of tree) {
      visit(node);
    }
  }

  private nextRequestId() {
    return this.requestIdCounter++;
  }

  private resolvePendingRequest(id: string | number, result: unknown) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.resolve(result);
  }

  private rejectPendingRequest(id: string | number, error: Error) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.reject(error);
  }

  private rejectAllPendingRequests(error: Error) {
    for (const id of this.pendingRequests.keys()) {
      this.rejectPendingRequest(id, new Error(error.message));
    }
  }

  private async request<T>(message: RPCRequest): Promise<T> {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectPendingRequest(
          message.id,
          new Error(`Debug RPC call timed out after ${this.timeout}ms`),
        );
      }, this.timeout);

      this.pendingRequests.set(message.id, { resolve, reject, timeout });
      this.transport.send(JSON.stringify(message));
    });
  }
}

function isDebugNotification(value: unknown): value is Rpc.Debug.Notification {
  if (!value || typeof value !== "object") {
    return false;
  }

  const notification = value as Partial<Rpc.Debug.Notification>;
  return (
    notification.type === "debug:log" ||
    notification.type === "debug:socket:message"
  );
}
