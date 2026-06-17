import {
  ProtectedTypedEventTarget,
  TypedEventTarget,
} from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import {
  Rpc,
  type Drivers,
  type Events,
  type Schema,
  type Sockets,
} from "@av/types";
import { AsyncLocalStorage } from "node:async_hooks";

type EventsMaybe = TypedEventTarget<any> | undefined;
type SocketMaybe = Partial<Sockets.Client> | undefined;

export abstract class Driver<
  Name extends string = string,
  Deps extends Drivers.Array = Drivers.Array,
  Api extends Drivers.ApiRecord = Drivers.ApiRecord,
  State extends Record<string, any> = Record<string, any>,
  Events extends EventsMaybe = EventsMaybe,
  Socket extends SocketMaybe = SocketMaybe,
> extends ProtectedTypedEventTarget<Events.Driver.Map> {
  public abstract state: State;
  public abstract api: Api;
  // TSAS:
  public socket: Socket = undefined as Socket;
  public schema?: () => Schema.Schema<Api> | Promise<Schema.Schema<Api>> =
    undefined;

  // TSAS: Subclasses or runtime wiring provide the concrete event target shape before use.
  public events: Events = undefined as Events;
  // TSAS: This anchor keeps the resolved dependency record available for type recursion.
  public name: Name;
  public deps: Deps = [] as unknown as Deps;
  protected tel: Telemetry;

  constructor({ name, deps }: { name: Name; deps?: Deps }) {
    super();
    // TSAS: Could be instantiated with different type
    if (deps) {
      this.deps = deps;
    }
    this.name = name;
    this.tel = new Telemetry(`Driver::${this.name}`);
  }

  protected dispatch<K extends keyof Events.Driver.Map>(
    type: K,
    payload: Events.Driver.Map[K],
  ): void {
    super.dispatch(type, payload);

    this.tel.info("EVENT_DISPATCHED", { type });
  }

  public start(): Promise<void> | void {
    this.socket?.start?.();
  }
  public end(): Promise<void> | void {
    this.socket?.end?.();
  }

  public dep<K extends NonNullable<Deps>[number]["name"]>(
    name: K,
  ): Extract<NonNullable<Deps>[number], { name: K }> {
    const child = this.deps?.find(
      (d): d is Extract<NonNullable<Deps>[number], { name: K }> =>
        d.name === name,
    );

    if (!child) {
      throw new Error(`missing dependency: ${name}`);
    }

    return child;
  }
}

export class Manager<
  const D extends Drivers.Array = Drivers.Array,
  const S extends readonly Drivers.AnyDeferred[] =
    readonly Drivers.AnyDeferred[],
  Context extends Drivers.Context = Drivers.Context,
> implements Drivers.Manager<D, S, Context> {
  readonly configs: Drivers.Merged<D, S>;
  readonly configs_flat: Driver[];
  private contextStore = new AsyncLocalStorage<Context>();
  public readonly bus = new TypedEventTarget<
    Events.Natav.Map<Drivers.Merged<D, S>>
  >();

  GetContext() {
    const ctx = this.contextStore.getStore();
    if (!ctx) {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.CtxNotFound,
        message: "could not find context.",
      });
    }
    return ctx;
  }

  constructor(args: { drivers?: D; deferred?: S }) {
    let configs: Driver[] = [];
    if (args.drivers) {
      configs = [...args.drivers];
    }

    if (args.deferred) {
      for (const deferred of args.deferred) {
        // TSAS: Deferred entries are either constructors or factories returning drivers.
        if ("prototype" in deferred && typeof deferred.prototype === "object") {
          configs.push(new deferred(this));
        } else {
          configs.push(deferred(this));
        }
      }
    }

    // TSAS: The public configs property is the tuple-shaped merged driver set for type inference.
    this.configs = configs as unknown as Drivers.Merged<D, S>;

    const collect = (driver: Driver): Driver[] => {
      const out: Driver[] = [driver];
      for (const dep of driver.deps ?? []) {
        out.push(...collect(dep));
      }
      return out;
    };

    this.configs_flat = this.configs.flatMap(collect);
  }

  runWithContext<T>(context: Context, fn: () => T): T {
    return this.contextStore.run(context, fn);
  }

  GetDriver<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.FromName<Drivers.Merged<D, S>, N> {
    // TSAS:
    return this.FindDriver(name) as Drivers.FromName<Drivers.Merged<D, S>, N>;
  }

  GetDriverState<N extends Drivers.Names<Drivers.Merged<D, S>>>(
    name: N,
  ): Drivers.State<Drivers.Merged<D, S>, N> {
    return this.GetDriver(name).state;
  }

  FindDriver(name: string): Driver | undefined {
    return this.configs_flat.find((d) => d.name === name);
  }

  GetAllDriverNames(): string[] {
    return this.configs_flat.map((d) => d.name);
  }

  GetTree(): Drivers.DriverView[] {
    const toNode = (driver: Driver): Drivers.DriverView | undefined => {
      const socket = driver.socket;
      const canWrite = typeof socket?.write === "function";
      const canReceive = typeof socket?.on === "function";

      const node = {
        name: driver.name,
        deps: (driver.deps ?? [])
          .map((child) => toNode(child))
          .filter((child): child is Drivers.DriverView => child !== undefined),
        ...(typeof socket?.name === "string" ?
          {
            socket: {
              traceName: socket.name,
              canWrite,
              canReceive,
            },
          }
        : {}),
      };

      return node;
    };
    return this.configs
      .map((driver) => toNode(driver))
      .filter((s) => s !== undefined);
  }

  async Start(
    filter?: (
      drivers: Drivers.Merged<D, S>,
    ) => Drivers.PartialArray<Drivers.Merged<D, S>>,
  ) {
    let configs: Drivers.PartialArray<Drivers.Merged<D, S>> = this.configs;
    if (filter) {
      configs = filter(this.configs);
    }

    const promises = configs.map(async (d) => {
      d.on("driver:state-updated", (data) =>
        // TSAS: Each iterated driver comes from this manager's merged config tuple, so its name and state match the bus event union.
        this.bus.dispatch("natav:state:update", {
          name: d.name,
          data: data.data,
        }),
      );

      d.socket?.on?.("debug", (event) => {
        this.bus.dispatch("natav:debug:socket", {
          name: d.name,
          data: event.data,
        });
      });

      d.on("driver:delimited", (payload) => {
        this.bus.dispatch("natav:debug:socket", {
          name: d.name,
          data: {
            traceName: d.socket?.name ?? d.name,
            direction: "rx-delimited",
            time: Date.now(),
            encoding: "utf8",
            data: new Uint8Array(
              payload.buffer,
              payload.byteOffset,
              payload.byteLength,
            ),
          },
        });
      });

      await d.start();
    });

    await Promise.all(promises);
  }

  async End() {
    const promises = this.configs.map(async (d) => {
      await d.end();
    });

    await Promise.all(promises);
  }
}
