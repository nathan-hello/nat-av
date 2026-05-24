import type { Natav } from "@av/types";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { DeviceEvents } from "@av/rpc/client/types";
import type { ClientRpc } from "@av/rpc/client";

export class ClientRpcDevice<
  N extends Natav.Orch,
  Name extends Natav.Names<N>,
> extends TypedEventTarget<DeviceEvents<N, Name>> {
  private apiProxy: Natav.Handle<N, Name>["api"];
  private stateValue: Natav.State<N, Name> | undefined;
  private pendingCounts = new Map<string, number>();

  constructor(
    private client: ClientRpc<N>,
    public readonly name: Name,
  ) {
    super();

    // TSAS: Proxies are used to mirror the device API shape at runtime.
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
    ) as Natav.Handle<N, Name>["api"];

    this.on("change", () => this.client.emitChange(this.name));
  }

  get api() {
    return this.apiProxy;
  }

  get state() {
    return this.stateValue;
  }

  async call(
    method: string,
    args: any[] = [],
  ) {
    this.incrementPending(method);
    try {
      return await this.client.call(this.name, method, args);
    } finally {
      this.decrementPending(method);
    }
  }

  isPending(method: Extract<keyof Natav.Handle<N, Name>["api"], string>) {
    return this.pendingCount(method) > 0;
  }

  pendingCount(method: Extract<keyof Natav.Handle<N, Name>["api"], string>) {
    return this.pendingCounts.get(method) ?? 0;
  }

  dep<DepName extends Natav.DepNames<N, Name>>(depName: DepName) {
    return this.client.device(depName);
  }

  handleStateUpdate(patch: Partial<Natav.State<N, Name>>) {
    const currentState = this.stateValue;
    // TSAS: Partial patches are reconciled into the device's cached state.
    this.stateValue =
      currentState && typeof currentState === "object" ?
        { ...currentState, ...patch }
      : (patch as Natav.State<N, Name>);

    this.dispatchChange();
  }

  dispatchChange() {
    this.dispatch("change", {
      name: this.name,
      state: this.state,
    });
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
