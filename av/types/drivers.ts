import type { Driver, Manager } from "@av/drivers";
import type { TypedEventTarget } from "@av/lib/eventtarget";
import type { Sockets } from "@av/types/socket";

type IsAny<T> = 0 extends 1 & T ? true : false;

// This namespace is not allowed to import Natav namespace.
// The Natav namespace uses Driver for inference, so trying
// to get the Natav.Names<N> for example will cause a circular
// dependency that Typescript cannot resolve.
export namespace Drivers {
  export type Array = readonly Driver[];

  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type AnyDriver = Driver<
    string,
    Record<string, AnyDriver>,
    string,
    ApiRecord,
    Record<string, any>,
    TypedEventTarget<{ [x: string]: any }> | undefined,
    Partial<Sockets.Client> | undefined
  >;

  export type Merged<
    D extends Drivers.Array,
    S extends readonly Drivers.Deferred[],
  > = readonly [...D, ...Drivers.DeferredInstances<S>];

  export type Deferred<T extends Driver = Driver> =
    | ((natav: Manager<any, any>) => T)
    | (new (natav: Manager<any, any>) => T);

  export type DeferredReturn<T> =
    T extends new (...args: any[]) => infer R ? R
    : T extends (...args: any[]) => infer R ? R
    : never;

  export type DeferredInstances<S extends readonly Drivers.Deferred[]> = {
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
    D extends Driver ? D | WithDeps<Extract<Dep.Union<D["deps"]>, Driver>>
    : D extends Drivers.Array ? WithDeps<D[number]>
    : never;

  export type Names<N extends Drivers.Array> = Drivers.WithDeps<N>["name"];

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

    export type FromName<
      N extends Drivers.Array,
      Name extends Drivers.Names<N>,
      DepName extends Drivers.Dep.Names<N, Name>,
    > = Extract<Deps<N, Name>[DepName], Driver>;

    export type Deps<
      N extends Drivers.Array,
      Name extends Drivers.Names<N>,
    > = Drivers.FromName<N, Name>["deps"];

    export type Input =
      | readonly Drivers.AnyDriver[]
      | readonly { driver: Drivers.AnyDriver }[];
    export type Union<Deps> =
      IsAny<Deps> extends true ? never
      : Deps extends Record<string, infer Dep> ? Dep
      : never;

    export type Names<N extends Drivers.Array, Name extends Drivers.Names<N>> =
      IsAny<Deps<N, Name>> extends true ? never : keyof Deps<N, Name> & string;
  }
}
