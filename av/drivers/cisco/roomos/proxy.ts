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

        switch (prop) {
          case "get":
            return (..._args: unknown[]) =>
              this.request({ kind: "get", root: "xConfiguration", path });

          case "set":
            return (...args: unknown[]) =>
              this.request({
                kind: "set",
                root: "xConfiguration",
                path,
                value: args[0],
              });
          case "on":
          case "once":
            return () =>
              this.request({ kind: "listen", root: "xConfiguration", path });

          default:
            return new RoomOSProxy(this.request).Configuration(
              RoomOSProxy.childPath(path, prop),
            );
        }
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

  private realState: Record<string | symbol, any> = {};

  State(path: readonly string[] = []) {
    return new Proxy(this.realState, {
      get: (_, prop) => {
        if (typeof prop === "symbol") {
          return this.realState[prop];
        }

        const currentPath = [...path, prop];

        // Find leaf
        const value = currentPath.reduce(
          (target, key) => target?.[key],
          this.realState,
        );

        if (value === undefined) {
          return new RoomOSProxy(this.request).State(currentPath);
        }

        if (typeof value === "object" && value !== null) {
          return new RoomOSProxy(this.request).State(currentPath);
        }

        return value;
      },
      set: (_, prop, value) => {
        if (typeof prop === "symbol") {
          this.realState[prop] = value;
          return true;
        }

        const currentPath = [...path, prop];

        // Dig down to parent node directly on the single class target
        let parent = this.realState;
        for (let i = 0; i < currentPath.length - 1; i++) {
          const key = currentPath[i];
          if (typeof parent[key] !== "object" || parent[key] === null) {
            parent[key] = {};
          }
          parent = parent[key];
        }

        // parent is now set to currentPath[-1]
        // .length is 1-based, so get the leaf and set the value
        parent[currentPath[currentPath.length - 1]] = value;
        return true;
      },

      // Returns the actual keys present at the current nested path
      ownKeys: () => {
        const value = path.reduce(
          (target, key) => target?.[key],
          this.realState,
        );
        if (typeof value === "object" && value !== null) {
          return Reflect.ownKeys(value);
        }
        return [];
      },

      // Needed by JS engines to confirm keys returned by ownKeys are configurable
      getOwnPropertyDescriptor: (_, prop) => {
        const value = path.reduce(
          (target, key) => target?.[key],
          this.realState,
        );
        if (value && typeof value === "object" && prop in value) {
          return {
            enumerable: true,
            configurable: true,
            value: value[prop],
          };
        }
        return undefined;
      },
    });
  }

  UpdateState(path: readonly string[], value: unknown): void {
    if (path.length === 0) {
      // If the path is empty, we overwrite the root state object
      if (typeof value === "object" && value !== null) {
        this.realState = { ...value };
      }
      return;
    }

    let parent = this.realState;

    // Traverse to the parent of the leaf node
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (typeof parent[key] !== "object" || parent[key] === null) {
        parent[key] = {};
      }
      parent = parent[key];
    }

    // Set the value on the leaf node
    const leafKey = path[path.length - 1];
    parent[leafKey] = value;
  }
}
