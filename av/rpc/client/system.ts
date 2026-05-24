import type { Natav, Rpc, Events } from "@av/types";

import { TypedEventTarget } from "@av/lib/eventtarget";
import { RPCRequest } from "@av/rpc/protocol";
import { Telemetry } from "@av/telemetry";

type SystemClient = {
  request<T>(message: RPCRequest): Promise<T>;
  nextRequestId(): number;
};

export class ClientRpcSystem<
  N extends Natav.Orch = Natav.Orch,
> extends TypedEventTarget<Events.Rpc.Client.SystemMap> {
  private tel = new Telemetry("Rpc::System");
  private apiProxy: Rpc.Client.System.Api<N>;
  private pendingCounts = new Map<string, number>();
  private stateValue: Promise<Rpc.Client.System.State> | undefined;

  constructor(private client: SystemClient) {
    super();

    // TSAS: Proxies are used to mirror the system API shape at runtime.
    this.apiProxy = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }

          return (...args: any[]) => this.call(methodName, args);
        },
      },
    ) as Rpc.Client.System.Api<N>;
  }

  get api() {
    return this.apiProxy;
  }

  get state(): Promise<Rpc.Client.System.State> {
    return this.stateValue ?? this.refreshState();
  }

  isPending(method: keyof Rpc.Client.System.Api<N>) {
    return this.pendingCount(method) > 0;
  }

  pendingCount(method: keyof Rpc.Client.System.Api<N>) {
    return this.pendingCounts.get(String(method)) ?? 0;
  }

  reset() {
    this.stateValue = undefined;
    this.dispatchChange();
  }

  async call(method: string, args: any[] = []) {
    this.tel.debug("system.call", { method, args });
    this.incrementPending(method);
    try {
      return await this.client.request(
        new RPCRequest(this.client.nextRequestId(), "system.api", {
          method,
          args,
        }),
      );
    } finally {
      this.decrementPending(method);
    }
  }

  private refreshState(): Promise<Rpc.Client.System.State> {
    this.tel.debug("system.state");
    const state = this.client.request<Rpc.Client.System.State>(
      new RPCRequest(this.client.nextRequestId(), "system.state"),
    );

    this.stateValue = state.then(
      (value) => {
        this.dispatchChange();
        return value;
      },
      (error) => {
        this.stateValue = undefined;
        this.dispatchChange();
        throw error;
      },
    );

    this.dispatchChange();
    return this.stateValue;
  }

  private dispatchChange() {
    this.dispatch("change", { state: this.stateValue });
  }

  private incrementPending(method: string) {
    this.pendingCounts.set(method, (this.pendingCounts.get(method) ?? 0) + 1);
    this.dispatchChange();
  }

  private decrementPending(method: string) {
    const current = this.pendingCounts.get(method);
    if (!current) {
      return;
    }

    if (current === 1) {
      this.pendingCounts.delete(method);
    } else {
      this.pendingCounts.set(method, current - 1);
    }

    this.dispatchChange();
  }
}
