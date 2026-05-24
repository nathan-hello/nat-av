import type { System } from "@av/system";
import type { Natav } from "@av/types/natav";

export namespace Rpc {
  export namespace System {
    export type State = System["state"];
    export type Api<N extends Natav.Orch> = {
      [M in keyof System<N>["api"]]: System<N>["api"][M] extends (
        (...args: infer Args) => infer R
      ) ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };

    export type ClientHandle<N extends Natav.Orch> = {
      api: Rpc.System.Api<N>;
      readonly state: Promise<Rpc.System.State>;
      isPending(method: keyof Rpc.System.Api<N>): boolean;
      pendingCount(method: keyof Rpc.System.Api<N>): number;
    };
  }
}
