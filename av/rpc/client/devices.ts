import type Natav from "@av/natav";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { ClientRpcDeviceDebug, DeviceEvents } from "@av/rpc/client/types";
import type { ClientRpc } from "@av/rpc/client";

export class ClientRpcDevice<
  N extends Natav,
  Name extends Natav.Names<N> = Natav.Names<N>,
> extends TypedEventTarget<DeviceEvents<N, Name>> {
  private apiProxy: Natav.Handle<N, Name>["api"];

  constructor(
    private client: ClientRpc<N>,
    public readonly name: Name,
  ) {
    super();

    this.apiProxy = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }

          return (...args: any[]) => this.client.call(this.name, methodName, args);
        },
      },
    ) as Natav.Handle<N, Name>["api"];
  }

  get api() {
    return this.apiProxy;
  }

  get state() {
    return this.client.getDeviceState(this.name);
  }

  get connected() {
    return this.client.getDeviceConnection(this.name);
  }

  get schema() {
    return this.client.getDeviceSchema(this.name);
  }

  get debug(): ClientRpcDeviceDebug {
    const schema = this.schema;

    return {
      schema,
      driverName: schema?.driverName,
      typeName: schema?.typeName,
      source: schema?.source,
      deps: schema?.deps ?? [],
      methods: schema?.methods ?? {},
      socket: schema?.socket ?? null,
      state: schema?.state,
      logs: this.client.getDeviceLogs(this.name),
      clearLogs: () => {
        this.client.clearLogs(this.name);
      },
    };
  }

  dep<DepName extends Natav.DepNames<N, Name>>(depName: DepName) {
    return this.client.device(depName);
  }

  refresh() {
    return this.client.refreshDevice(this.name);
  }

  notify() {
    super.dispatch("change", {
      name: this.name,
      state: this.state,
      connected: this.connected,
    });
  }
}
