import type { RoomOS } from "@av/drivers/cisco/roomos/types";

type TRequest = (operation: RoomOS.WriteOperation) => Promise<unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RoomOSProxy {
  private static target<T>() {
    return () => undefined as T;
  }

  private static childPath(path: readonly string[], prop: string) {
    return [...path, prop];
  }

  private request: TRequest;

  constructor(request: TRequest) {
    this.request = request;
  }



  Command(path: readonly string[] = ["xCommand"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        return new RoomOSProxy(this.request).Command(
          RoomOSProxy.childPath(path, prop),
        );
      },
      apply: (_, __, args: unknown[]) => {
        if (args.length === 0) {
          return this.request({ kind: "command", root: "xCommand", path });
        }

        const [first, second] = args;

        if (typeof first === "string") {
          return this.request({
            kind: "command",
            root: "xCommand",
            path,
            args: undefined,
            body: first,
          });
        }

        if (isPlainRecord(first)) {
          if (typeof second === "string") {
            return this.request({
              kind: "command",
              root: "xCommand",
              path,
              args: first,
              body: second,
            });
          }

          return this.request({
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

  Configuration(path: readonly string[] = ["xConfiguration"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
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
              return this.request({
                kind: "get",
                root: "xConfiguration",
                path,
              });
            }

            if (prop === "set") {
              return this.request({
                kind: "set",
                root: "xConfiguration",
                path,
                value: args[0],
              });
            }

            return this.request({
              kind: "listen",
              root: "xConfiguration",
              path,
            });
          };
        }

        return new RoomOSProxy(this.request).Configuration(
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  Status(path: readonly string[] = ["xStatus"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "get" || prop === "on" || prop === "once") {
          return () => {
            if (prop === "get") {
              return this.request({ kind: "get", root: "xStatus", path });
            }

            return this.request({ kind: "listen", root: "xStatus", path });
          };
        }

        return new RoomOSProxy(this.request).Status(
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  Feedback(path: readonly string[] = ["xFeedback"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "subscribe" || prop === "on" || prop === "once") {
          return () =>
            this.request({ kind: "listen", root: "xFeedback", path });
        }

        return new RoomOSProxy(this.request).Feedback(
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  private realState = {};

  State(path: readonly string[] = [""]) {

    

  }
}
