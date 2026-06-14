import { ProtectedTypedEventTarget } from "@av/lib/eventtarget";
import type { ClientRpc } from "@av/rpc/client";
import { Rpc, type Drivers } from "@av/types";

type RpcDebugEvents = {
  ready: boolean;
  close: CloseEvent;
  error:
    | { reason: "transport"; event: Event }
    | { reason: "json-parse-failed"; raw: string };
  change: {};
};

export class RpcDebugClient<
  N extends Drivers.Array,
> extends ProtectedTypedEventTarget<RpcDebugEvents> {
  readonly rpc: ClientRpc<N>;

  private deviceIndex = new Map<string, Rpc.Debug.Node>();

  public tree: Rpc.Debug.Node[] = [];

  constructor(rpc: ClientRpc<N>) {
    super();
    this.rpc = rpc;

    this.rpc.on("ready", () => {
      this.syncFromServer();
      this.dispatch("ready", true);
      this.dispatch("change", {});
    });

    this.rpc.on("close", (event) => {
      this.dispatch("close", event);
      this.dispatch("change", {});
    });

    this.rpc.on("change", () => {
      this.syncFromServer();
      this.dispatch("change", {});
    });

    this.syncFromServer();
  }

  connect() {
    this.syncFromServer();
  }

  close(code?: number, reason?: string) {
    this.dispatch(
      "close",
      new CloseEvent("close", {
        code: code ?? 1000,
        reason: reason ?? "",
      }),
    );
  }

  get isOnline() {
    return this.rpc.isOnline;
  }

  async writeSocket(
    deviceName: string,
    text: string,
    encoding: Rpc.Debug.Encoding = "utf8",
  ) {
    return await this.getDebuggerDevice().api.debug.socket.write({
      deviceName,
      text,
      encoding,
    });
  }

  getDevice(name: string) {
    return this.deviceIndex.get(name);
  }

  private syncFromServer() {
    const state = this.getDebuggerDevice().state;
    if (!state) {
      return;
    }

    this.tree = state.tree ?? [];
    this.deviceIndex = new Map();

    const visit = (node: Rpc.Debug.Node) => {
      this.deviceIndex.set(node.name, node);

      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of this.tree) {
      visit(node);
    }
  }

  private getDebuggerDevice() {
    // TSAS: The debug driver is registered as a deferred built-in driver in the server setup.
    return this.rpc.device("debugger" as Drivers.Names<N>);
  }
}
