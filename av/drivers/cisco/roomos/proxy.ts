import type { TArgument } from "./types";
import type { TMapToX, TOutput } from "./types";
import { RoomOSWriter } from "./writer";

// Map the "type" property to the actual return type of the leaf functions
type TMapReturn<T extends TOutput["type"]> = T extends "http" ? Request : string;

/**
 * Re-maps the TCommand structure so that every leaf function
 * returns the type specified by the proxy configuration.
 */
type MapToProxyReturn<Obj, R> = {
  [K in keyof Obj]: Obj[K] extends (...args: infer A) => any ? (...args: A) => R
  : MapToProxyReturn<Obj[K], R>;
};

export function createProxy<T extends keyof TMapToX, C extends TOutput>(
  root: T,
  config: C,
  path: string[] = [root],
): MapToProxyReturn<TMapToX[T], TMapReturn<C["type"]>> {
  // We use Function as the target so the 'apply' trap is valid
  const target = (() => {}) as any;

  return new Proxy(target, {
    get(_, prop: string) {
      // If JS runtime is looking for internal symbols, return undefined
      // so the runtime never pollutes the path given to RoomOSWriter
      if (typeof prop === "symbol") {
        return undefined;
      }
      return createProxy(root, config, [...path, prop]);
    },
    apply(_, __, args: [TArgument]) {
      const writer = new RoomOSWriter(path, args[0]);

      switch (config.type) {
        case "terminal":
          return writer.ToTerminal(config.getResultId?.());
        case "xml":
          return writer.ToXml(config.getResultId?.());
        case "jsonrpc":
          return writer.ToJsonRpc(config.getId());
        case "http":
          return writer.ToHttp(config.getSessionId());
        default:
          throw new Error("Invalid proxy type");
      }
    },
  });
}
