import type { Driver } from "@av/drivers";
import type { Orchistrator } from "@av/lib/orch";

type IsAny<T> = 0 extends 1 & T ? true : false;

type DepMapOf<D extends Driver> = D["deps"];

type DepUnion<Deps> =
  IsAny<Deps> extends true ? never
  : Deps extends Record<string, infer Dep> ? Dep
  : never;

type DriverTree<D> =
  D extends Driver ? D | DriverTree<Extract<DepUnion<DepMapOf<D>>, Driver>>
  : never;

type DriversOf<C extends readonly Driver[]> = DriverTree<C[number]>;

export type NamesOf<C extends readonly Driver[]> = DriversOf<C>["name"];

export type DriverFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
> = Extract<DriversOf<C>, { name: N }>;

export type StateFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
> = DriverFor<C, N>["state"];


type ApiFor<C extends readonly Driver[], N extends NamesOf<C>> = {
  [M in keyof DriverFor<C, N>["api"]]: DriverFor<C, N>["api"][M] extends (
    (...args: infer Args) => infer R
  ) ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type DepsOf<C extends readonly Driver[], N extends NamesOf<C>> = DriverFor<
  C,
  N
>["deps"];

type DepNamesOf<C extends readonly Driver[], N extends NamesOf<C>> =
  IsAny<DepsOf<C, N>> extends true ? never : keyof DepsOf<C, N> & string;

type DepFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
  DN extends DepNamesOf<C, N>,
> = Extract<DepsOf<C, N>[DN], Driver>;

type PromisifyApi<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer Args) => infer R ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type DepNames<Deps> = IsAny<Deps> extends true ? never : keyof Deps & string;

type DriverHandle<D extends Driver> = {
  api: PromisifyApi<D["api"]>;
  state: D["state"];
} & DriverDepMixin<D["deps"]>;

type DriverDepMixin<Deps> =
  [DepNames<Deps>] extends [never] ? {}
  : {
      dep: <DN extends DepNames<Deps>>(
        depName: DN,
      ) => DriverHandle<Extract<Deps[DN], Driver>>;
    };

export namespace Natav {
  export type Orch = Orchistrator;
  export type ConfigsOf<N extends Orchistrator> =
    N extends Orchistrator<infer C> ? C : never;
  export type Names<N extends Orchistrator> = NamesOf<ConfigsOf<N>>;
  export type Driver<N extends Orchistrator, Name extends Names<N>> = DriverFor<
    ConfigsOf<N>,
    Name
  >;
  export type State<N extends Orchistrator, Name extends Names<N>> = StateFor<
    ConfigsOf<N>,
    Name
  >;

  export type StateMap<N extends Orchistrator> = Partial<{
    [K in Natav.Names<N>]: Natav.State<N, K>;
  }>;

  export type Api<N extends Orchistrator, Name extends Names<N>> = ApiFor<
    ConfigsOf<N>,
    Name
  >;
  export type Deps<N extends Orchistrator, Name extends Names<N>> = DepsOf<
    ConfigsOf<N>,
    Name
  >;
  export type DepNames<
    N extends Orchistrator,
    Name extends Names<N>,
  > = DepNamesOf<ConfigsOf<N>, Name>;
  export type Dep<
    N extends Orchistrator,
    Name extends Names<N>,
    DepName extends DepNames<N, Name>,
  > = DepFor<ConfigsOf<N>, Name, DepName>;
  export type DepState<
    N extends Orchistrator,
    Name extends Names<N>,
    DepName extends DepNames<N, Name>,
  > = Dep<N, Name, DepName>["state"];
  export type DepApi<
    N extends Orchistrator,
    Name extends Names<N>,
    DepName extends DepNames<N, Name>,
  > = {
    [M in keyof Dep<N, Name, DepName>["api"]]: Dep<
      N,
      Name,
      DepName
    >["api"][M] extends (...args: infer Args) => infer R ?
      (...args: Args) => Promise<Awaited<R>>
    : never;
  };
  export type Handle<
    N extends Orchistrator,
    Name extends Names<N>,
  > = DriverHandle<DriverFor<ConfigsOf<N>, Name>>;
}
