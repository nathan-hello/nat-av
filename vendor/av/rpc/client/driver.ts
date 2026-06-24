import type { Manager } from "@av/drivers";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { RpcClient } from "@av/rpc/client";
import type { Drivers, Events } from "@av/types";
import { Rpc } from "@av/types";

export class ClientRpcDriver<
  N extends Manager = Manager,
  Name extends Drivers.Names<N["configs"]> = Drivers.Names<N["configs"]>,
> extends TypedEventTarget<Events.Rpc.DriverMap<N["configs"], Name>> {
  private apiProxy: Rpc.Client.Api<N["configs"], Name>;
  private pendingCounts = new Map<string, number>();
  private eventState = new Map<string, Rpc.Client.Events.State>();

  readonly event: Rpc.Client.Events.Handle<N["configs"], Name> = {
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

  public state: Drivers.State<N["configs"], Name> =
    // TSAS: this assertion depends on client getting
    // accurate state before this class is used for rendering.
    {} as unknown as Drivers.State<N["configs"], Name>;

  dep<DepName extends Drivers.DepNames<N, Name>>(depName: DepName) {
    return this.client.driver(depName);
  }

  private createApiProxy(
    path: string[] = [],
  ): Rpc.Client.Api<N["configs"], Name> {
    return new Proxy(() => undefined, {
      get: (_, methodName: string | symbol) => {
        if (typeof methodName !== "string" || methodName === "then") {
          return undefined;
        }

        return this.createApiProxy([...path, methodName]);
      },
      apply: (_, __, args: unknown[]) => this.call(path.join("/"), args),
      // TSAS: Proxy
    }) as unknown as Rpc.Client.Api<N["configs"], Name>;
  }

  async call(method: string, args: any[] = []) {
    this.incrementPending(method);
    try {
      return await this.client.call(this.name, method, args);
    } finally {
      this.decrementPending(method);
    }
  }

  pendingCount(method: string) {
    return this.pendingCounts.get(method) ?? 0;
  }

  handleStateUpdate(patch: Partial<Rpc.Client.State<N["configs"], Name>>) {
    const currentState = this.state;
    // TSAS: Partial patches are reconciled into the driver's cached state.
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
    K extends keyof Drivers.Events<N["configs"], Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N["configs"], Name, K>) {
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
          Rpc.Request.driverSubscribe(this.client.nextRequestId(), {
            driver: this.name,
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
    K extends keyof Drivers.Events<N["configs"], Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N["configs"], Name, K>) {
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
        Rpc.Request.driverUnsubscribe(this.client.nextRequestId(), {
          driver: this.name,
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
