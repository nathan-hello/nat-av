import type { RoomOS } from "@av/drivers/cisco/roomos/types";

type TRequest = (operation: RoomOS.WriteOperation) => Promise<unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RoomOSProxy {
  private static target() {
    return () => undefined;
  }

  private static childPath(path: readonly string[], prop: string) {
    return [...path, prop];
  }

  static Command(
    request: TRequest,
    path: readonly string[] = ["xCommand"],
  ): any {
    return new Proxy(RoomOSProxy.target(), {
      get(_, prop: string | symbol) {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        return RoomOSProxy.Command(request, RoomOSProxy.childPath(path, prop));
      },
      apply(_, __, args: unknown[]) {
        if (args.length === 0) {
          return request({ kind: "command", root: "xCommand", path });
        }

        const [first, second] = args;

        if (typeof first === "string") {
          return request({
            kind: "command",
            root: "xCommand",
            path,
            args: undefined,
            body: first,
          });
        }

        if (isPlainRecord(first)) {
          if (typeof second === "string") {
            return request({
              kind: "command",
              root: "xCommand",
              path,
              args: first,
              body: second,
            });
          }

          return request({
            kind: "command",
            root: "xCommand",
            path,
            args: first,
          });
        }

        throw new TypeError("Invalid command arguments");
      },
    });
  }

  static Configuration(
    request: TRequest,
    path: readonly string[] = ["xConfiguration"],
  ): any {
    return new Proxy(RoomOSProxy.target(), {
      get(_, prop: string | symbol) {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (
          prop === "get" ||
          prop === "set" ||
          prop === "on" ||
          prop === "once"
        ) {
          return (...args: unknown[]) => {
            if (prop === "get") {
              return request({ kind: "get", root: "xConfiguration", path });
            }

            if (prop === "set") {
              return request({
                kind: "set",
                root: "xConfiguration",
                path,
                value: args[0],
              });
            }

            return request({ kind: "listen", root: "xConfiguration", path });
          };
        }

        return RoomOSProxy.Configuration(
          request,
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  static Status(request: TRequest, path: readonly string[] = ["xStatus"]): any {
    return new Proxy(RoomOSProxy.target(), {
      get(_, prop: string | symbol) {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "get" || prop === "on" || prop === "once") {
          return () => {
            if (prop === "get") {
              return request({ kind: "get", root: "xStatus", path });
            }

            return request({ kind: "listen", root: "xStatus", path });
          };
        }

        return RoomOSProxy.Status(request, RoomOSProxy.childPath(path, prop));
      },
    });
  }

  static Feedback(
    request: TRequest,
    path: readonly string[] = ["xFeedback"],
  ): any {
    return new Proxy(RoomOSProxy.target(), {
      get(_, prop: string | symbol) {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "subscribe" || prop === "on" || prop === "once") {
          return () => request({ kind: "listen", root: "xFeedback", path });
        }

        return RoomOSProxy.Feedback(request, RoomOSProxy.childPath(path, prop));
      },
    });
  }
}
