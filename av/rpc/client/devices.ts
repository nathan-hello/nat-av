import type { Natav, Events } from "@av/types";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { ClientRpc } from "@av/rpc/client";
import { RPCRequest } from "@av/rpc/protocol";
import { Rpc } from "@av/types";

type DeviceEventCallback<
  N extends Natav.Orch,
  Name extends Natav.Names<N>,
  K extends keyof Natav.Events<N, Name> & string,
> = (payload: Natav.Events<N, Name>[K]) => void;

type DeviceEventHandle<N extends Natav.Orch, Name extends Natav.Names<N>> = {
  on<K extends keyof Natav.Events<N, Name> & string>(
    event: K,
    callback: DeviceEventCallback<N, Name, K>,
  ): Promise<() => Promise<void>>;
};

type DeviceEventState = {
  callbacks: Set<(payload: any) => void>;
  subscribed: boolean;
  pendingSubscribe: Promise<void> | undefined;
  pendingUnsubscribe: Promise<void> | undefined;
};

export class ClientRpcDevice<
  N extends Natav.Orch,
  Name extends Natav.Names<N>,
> extends TypedEventTarget<Events.Rpc.DeviceMap<N, Name>> {
  private apiProxy: Natav.Handle<N, Name>["api"];
  private stateValue: Natav.State<N, Name> | undefined;
  private pendingCounts = new Map<string, number>();
  private eventState = new Map<string, DeviceEventState>();

  readonly event: DeviceEventHandle<N, Name> = {
    on: async (event, callback) => {
      await this.subscribeToEvent(event, callback);
      return async () => {
        await this.unsubscribeFromEvent(event, callback);
      };
    },
  };

  constructor(
    private client: ClientRpc<N>,
    public readonly name: Name,
  ) {
    super();

    // TSAS: Proxies are used to mirror the nested device API shape at runtime.
    this.apiProxy = this.createApiProxy() as Natav.Handle<N, Name>["api"];

    this.on("change", () => this.client.emitChange(this.name));
  }

  get api() {
    return this.apiProxy;
  }

  get state() {
    return this.stateValue;
  }

  private createApiProxy(path: string[] = []) {
    return new Proxy(
      () => undefined,
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string" || methodName === "then") {
            return undefined;
          }

          return this.createApiProxy([...path, methodName]);
        },
        apply: (_, __, args: unknown[]) => this.call(path.join("/"), args),
      },
    );
  }

  async call(method: string, args: any[] = []) {
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
    K extends keyof Natav.Events<N, Name> & string,
  >(event: K, callback: DeviceEventCallback<N, Name, K>) {
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
          new RPCRequest(
            this.client.nextRequestId(),
            Rpc.Device.Methods.DeviceSubscribe,
            {
              device: this.name,
              method: event,
              args: [],
            },
          ),
        )
        .then(() => {
          state.subscribed = true;
          state.pendingSubscribe = undefined;
        });

      await state.pendingSubscribe;
    }
  }

  private async unsubscribeFromEvent<
    K extends keyof Natav.Events<N, Name> & string,
  >(event: K, callback: DeviceEventCallback<N, Name, K>) {
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
        new RPCRequest(
          this.client.nextRequestId(),
          Rpc.Device.Methods.DeviceUnsubscribe,
          {
            device: this.name,
            method: event,
            args: [],
          },
        ),
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
