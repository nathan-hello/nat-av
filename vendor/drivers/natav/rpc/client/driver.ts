import type { Drivers, Events, Manager } from "@av/index";
import { TypedEventTarget } from "@av/index";
import { Rpc } from "../types";
import type { RpcClient } from "./index";

export class ClientRpcDriver<
  N extends Manager = Manager,
  Name extends Drivers.Names<N["drivers"]> = Drivers.Names<N["drivers"]>,
> extends TypedEventTarget<Events.Rpc.DriverMap<N["drivers"], Name>> {
  private apiProxy: Rpc.Client.Api<N["drivers"], Name>;
  private pendingCounts = new Map<string, number>();
  private eventState = new Map<string, Rpc.Client.Events.State>();
  private proxyCallId = 0;

  readonly event: Rpc.Client.Events.Handle<N["drivers"], Name> = {
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

  public state: Drivers.State<N["drivers"], Name> =
    // TSAS: this assertion depends on client getting
    // accurate state before this class is used for rendering.
    {} as unknown as Drivers.State<N["drivers"], Name>;

  dep<DepName extends Drivers.DepNames<N, Name>>(depName: DepName) {
    return this.client.driver(depName);
  }

  private createApiProxy(
    path: string[] = [],
  ): Rpc.Client.Api<N["drivers"], Name> {
    return new Proxy(() => undefined, {
      get: (_, methodName: string | symbol) => {
        if (typeof methodName !== "string" || methodName === "then") {
          return undefined;
        }

        return this.createApiProxy([...path, methodName]);
      },
      apply: (_, __, args: unknown[]) => {
        const method = path.join("/");
        const id = this.proxyCallId++;

        // TSAS: proxy method path and args are always valid per the driver's API type
        this.dispatch("before:request", { id, method, args } as any);

        const promise = this.call(method, args);

        promise.then(
          // TSAS: proxy method/data match the resolved API type at runtime
          (data) => {
            this.dispatch("after:response", { id, method, data } as any);
            this.dispatch("after:response:ok", { id, method, data } as any);
          },
          // TSAS: RPC rejections from requests module are always Rpc.Error instances
          (error) => {
            this.dispatch("after:response", { id, method, error } as any);
            this.dispatch("after:response:error", { id, method, error } as any);
          },
        );

        return promise;
      },
      // TSAS: Proxy
    }) as unknown as Rpc.Client.Api<N["drivers"], Name>;
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

  handleStateUpdate(patch: Partial<Rpc.Client.State<N["drivers"], Name>>) {
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
    K extends keyof Drivers.Events<N["drivers"], Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N["drivers"], Name, K>) {
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
    K extends keyof Drivers.Events<N["drivers"], Name> & string,
  >(event: K, callback: Rpc.Client.Events.Callback<N["drivers"], Name, K>) {
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
