import type { Driver } from "@av/drivers";
import type { Sockets } from "@av/types/socket";

// This namespace is not allowed to import Natav namespace.
// The Natav namespace uses Driver for inference, so trying
// to get the Natav.Names<N> for example will cause a circular
// dependency that Typescript cannot resolve.
export namespace Drivers {
  export type ApiMethod = (...args: any[]) => any;
  export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

  export type AnyDriver = Driver<
    string,
    Record<string, AnyDriver>,
    string,
    ApiRecord,
    Record<string, any>,
    Partial<Sockets.Socket> | undefined
  >;

  export type Dependency = Record<string, AnyDriver>;

  export type DependencyInput =
    | readonly AnyDriver[]
    | readonly { driver: AnyDriver }[];
}
