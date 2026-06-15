import { TypedEventTarget } from "@av/lib/eventtarget";
import type { RpcClient } from "@av/rpc/client";
import type { Drivers, Events } from "@av/types";
import { Rpc } from "@av/types";

export class ClientRpcDevice<
  N extends Drivers.Array = Drivers.Array,
  Name extends Drivers.Names<N> = Drivers.Names<N>,
> extends TypedEventTarget<Events.Rpc.DeviceMap<N, Name>> {
  private apiProxy: Rpc.Api<N, Name>;
  private pendingCounts = new Map<string, number>();
  private eventState = new Map<string, Rpc.Client.Events.State>();

  readonly event: Rpc.Client.Events.Handle<N, Name> = {
    on: async (event, callback) => {
      await this.subscribeToEvent(event, callback);
      return async () => {
        await this.unsubscribeFromEvent(event, callback);
      };
    },
  };

  constructor(
    private client: RpcClient<N>,
    public readonly name: Name,
  ) {
    super();
    this.apiProxy = this.createApiProxy();
    this.on("change", () => this.client.emitChange(this.name));
  }

  get api() {
    return this.apiProxy;
  }

  public state: Drivers.State<N, Name> =
    // TSAS: this assertion depends on client getting
    // accurate state before this class is used for rendering.
    {} as unknown as Drivers.State<N, Name>;

  readonly deps = {
    get: <DepName extends Drivers.Dep.Names<N, Name>>(depName: DepName) => {
      return this.client.device(depName);
    },
  };

  private createApiProxy(path: string[] = []): Rpc.Api<N, Name> {
    return new Proxy(() => undefined, {
      get: (_, methodName: string | symbol) => {
        if (typeof methodName !== "string" || methodName === "then") {
          return undefined;
        }

        return this.createApiProxy([...path, methodName]);
      },
      apply: (_, __, args: unknown[]) => this.call(path.join("/"), args),
      // TSAS: Proxy
    }) as unknown as Rpc.Api<N, Name>;
  }

  async call(method: string, args: any[] = []) {
    this.incrementPending(method);
    try {
      return await this.client.call(this.name, method, args);
    } finally {
      this.decrementPending(method);
    }
  }

  isPending(method: string) {
    return this.pendingCount(method) > 0;
  }

  pendingCount(method: string) {
    return this.pendingCounts.get(method) ?? 0;
  }

  handleStateUpdate(patch: Partial<Rpc.State<N, Name>>) {
    const currentState = this.state;
    // TSAS: Partial patches are reconciled into the device's cached state.
    this.state =
      currentState && typeof currentState === "object" ?
        { ...currentState, ...patch }
      : patch;

    this.dispatchChange();
  }

  handleEvent(event: string, payload: unknown) {
    const state = this.eventState.get(event);
    if (!state) {
      return;
    }

    state.callbacks.forEach((callback) => callback(payload));
  }

  dispatchChange() {
    this.dispatch("change", {
      name: this.name,
      state: this.state,
    });
  }

  private async subscribeToEvent<
    K extends keyof Drivers.Events<N, Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N, Name, K>) {
    const state = this.eventState.get(event) ?? {
      callbacks: new Set<(payload: any) => void>(),
      subscribed: false,
      pendingSubscribe: undefined,
      pendingUnsubscribe: undefined,
    };

    state.callbacks.add(callback);
    this.eventState.set(event, state);

    if (!state.subscribed) {
      state.pendingSubscribe ??= this.client
        .request(
          Rpc.Protocol.Request.deviceSubscribe(this.client.nextRequestId(), {
            device: this.name,
            method: event,
            args: [],
          }),
        )
        .then(() => {
          state.subscribed = true;
          state.pendingSubscribe = undefined;
        });

      await state.pendingSubscribe;
    }
  }

  private async unsubscribeFromEvent<
    K extends keyof Drivers.Events<N, Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N, Name, K>) {
    const state = this.eventState.get(event);
    if (!state) {
      return;
    }

    state.callbacks.delete(callback);

    if (state.callbacks.size > 0) {
      return;
    }

    await (state.pendingSubscribe ?? Promise.resolve());

    if (!state.subscribed) {
      this.eventState.delete(event);
      return;
    }

      state.pendingUnsubscribe ??= this.client
        .request(
          Rpc.Protocol.Request.deviceUnsubscribe(this.client.nextRequestId(), {
            device: this.name,
            method: event,
            args: [],
          }),
        )
      .then(() => {
        state.subscribed = false;
        state.pendingUnsubscribe = undefined;
        this.eventState.delete(event);
      });

    await state.pendingUnsubscribe;
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
