import type { Driver } from "@av/drivers";
import type { TypedEventTarget } from "@av/lib/eventtarget";
import type { Rpc, Sockets, Events as TEvents } from "@av/types";

type IsAny<T> = 0 extends 1 & T ? true : false;

// This namespace is not allowed to import Natav namespace.
// The Natav namespace uses Driver for inference, so trying
// to get the Natav.Names<N> for example will cause a circular
// dependency that Typescript cannot resolve.
export namespace Drivers {
  export type Array = readonly Driver[];

  export interface ManagerView<N extends Drivers.Array = Drivers.Array> {
    readonly configs: N;
    bus: TypedEventTarget<TEvents.Natav.Map<N>>;
    GetDriver<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.FromName<N, Name>;
    GetDriverState<Name extends Drivers.Names<N>>(
      name: Name,
    ): Drivers.State<N, Name>;
    FindDriver(name: string): Driver | undefined;
    GetAllDriverNames(): string[];
    GetDebugTree(): Rpc.Debug.Node[];
    Start(): Promise<void>;
    End(): Promise<void>;
  }

  export interface Manager<
    D extends Drivers.Array = Drivers.Array,
    S extends readonly Drivers.AnyDeferred[] = readonly Drivers.AnyDeferred[],
  > extends ManagerView<Drivers.Merged<D, S>> {}

  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type AnyDriver = Driver<
    string,
    Record<string, AnyDriver>,
    string,
    ApiRecord,
    Record<string, any>,
    TypedEventTarget<{ [x: string]: Rpc.JSONValue }> | undefined,
    Partial<Sockets.Client> | undefined
  >;

  export type Merged<
    D extends Drivers.Array,
    S extends readonly Drivers.AnyDeferred[],
  > = readonly [...D, ...Drivers.DeferredInstances<S>];

  export type Deferred<
    N extends Drivers.Array = Drivers.Array,
    T extends Driver = Driver,
  > =
    | ((natav: Drivers.Manager<N>) => T)
    | (new (natav: Drivers.Manager<N>) => T);

  export type AnyDeferred<T extends Driver = Driver> =
    | ((natav: any) => T)
    | (new (natav: any) => T);

  export type DeferredReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type DeferredInstances<S extends readonly Drivers.AnyDeferred[]> = {
    [K in keyof S]: Drivers.DeferredReturn<S[K]>;
  };

  type PromisifyApi<Obj> = {
    [M in keyof Obj]: Obj[M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : Obj[M] extends readonly any[] ? Obj[M]
    : Obj[M] extends object ? PromisifyApi<Obj>[M]
    : Obj[M];
  };

  export type Api<
    N extends Drivers.Array,
    Name extends Drivers.Names<N>,
  > = FromName<N, Name>["api"];

  export type State<
    N extends Drivers.Array = Drivers.Array,
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = FromName<N, Name>["state"];

  export type Events<N extends Drivers.Array, Name extends Drivers.Names<N>> =
    FromName<N, Name>["events"] extends TypedEventTarget<infer Events> ? Events
    : never;

  export type WithDeps<D extends Driver | Drivers.Array> =
    D extends Driver ? D | WithDeps<Extract<Dep.Union<Dep.RecordOf<D>>, Driver>>
    : D extends Drivers.Array ? WithDeps<D[number]>
    : never;

  export type Names<N extends Drivers.Array = Drivers.Array> =
    Drivers.WithDeps<N>["name"];

  export type FromName<
    N extends readonly Driver[],
    Name extends Drivers.Names<N> = Drivers.Names<N>,
  > = Extract<Drivers.WithDeps<N>, { name: Name }>;

  export type Handle<D extends Driver> = {
    deps: D["deps"];
    name: D["name"];
    api: PromisifyApi<D["api"]>;
    state: D["state"];
    events: D["state"];
    on: D["on"];
  };

  export namespace Dep {
    export type TRecord = Record<string, AnyDriver>;

    export type Handle<Deps extends TRecord> = {
      get(): Deps;
      get<N extends keyof Deps & string>(name: N): Deps[N];
      set(vd: Input): void;
    };

    export type RecordOf<D extends Driver> = D["_deps"];

    export type FromName<
      N extends Drivers.Array,
      Name extends Drivers.Names<N>,
      DepName extends Drivers.Dep.Names<N, Name>,
    > = Extract<Deps<N, Name>[DepName], Driver>;

    export type Deps<
      N extends Drivers.Array,
      Name extends Drivers.Names<N>,
    > = RecordOf<Drivers.FromName<N, Name>>;

    export type Input =
      | TRecord
      | readonly Drivers.AnyDriver[]
      | readonly { driver: Drivers.AnyDriver }[];

    export type FromInput<I extends Drivers.Dep.Input> =
      I extends readonly Drivers.AnyDriver[] ?
        {
          [K in I[number]["name"]]: Extract<I[number], { name: K }>;
        }
      : I extends readonly { driver: AnyDriver }[] ?
        {
          [K in I[number]["driver"]["name"]]: Extract<
            I[number]["driver"],
            { name: K }
          >;
        }
      : I;

    export type Union<Deps> =
      IsAny<Deps> extends true ? never
      : Deps extends Record<string, infer Dep> ? Dep
      : never;

    export type Names<N extends Drivers.Array, Name extends Drivers.Names<N>> =
      IsAny<Deps<N, Name>> extends true ? never : keyof Deps<N, Name> & string;
  }
}
