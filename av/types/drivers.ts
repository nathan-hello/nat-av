import type { Driver } from "@av/driver";
import type { Sockets } from "@av/types/socket";

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
