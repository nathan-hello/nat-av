import type { RoomOS } from "@av/drivers/cisco/roomos/types";
import type { Telemetry } from "@av/telemetry";

type TRequest = (operation: RoomOS.WriteOperation) => Promise<unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatePath(path: readonly string[]): string[] {
  if (
    path[0] === "xConfiguration" ||
    path[0] === "xStatus" ||
    path[0] === "xFeedback"
  ) {
    return path.slice(1);
  }

  return [...path];
}

export class RoomOSProxy {
  private request: TRequest;
  private tel: Telemetry;

  constructor(tel: Telemetry, request: TRequest) {
    this.request = request;
    this.tel = tel;
  }

  private static target() {
    return () => undefined;
  }

  private static childPath(path: string[], prop: string) {
    return [...path, prop];
  }

  Command(path: string[] = ["xCommand"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        return new RoomOSProxy(this.tel, this.request).Command(
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

  Configuration(path: string[] = ["xConfiguration"]) {
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
          default:
            return new RoomOSProxy(this.tel, this.request).Configuration(
              RoomOSProxy.childPath(path, prop),
            );
        }
      },
    });
  }

  Status(path: string[] = ["xStatus"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "get") {
          return () => this.request({ kind: "get", root: "xStatus", path });
        }

        return new RoomOSProxy(this.tel, this.request).Status(
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  Feedback(path: string[] = ["xFeedback"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        if (prop === "subscribe") {
          return () => this.request({ kind: "sub", root: "xFeedback", path });
        }

        if (prop === "unsubscribe") {
          return () => this.request({ kind: "unsub", root: "xFeedback", path });
        }

        return new RoomOSProxy(this.tel, this.request).Feedback(
          RoomOSProxy.childPath(path, prop),
        );
      },
    });
  }

  private state: Record<string | symbol, any> = {};

  State(path: string[] = []) {
    return new Proxy(this.state, {
      get: (_, prop) => {
        if (typeof prop === "symbol") {
          return this.state[prop];
        }

        this.tel.info("Proxy.State.get(): this.state", { state: this.state });

        const currentPath = [...path, prop];

        this.tel.info("Proxy.State.get(): currentPath", { currentPath });

        // Find leaf
        const value = currentPath.reduce(
          (target, key) => target?.[key],
          this.state,
        );

        if (value === undefined) {
          return this.State(currentPath);
        }

        if (typeof value === "object" && value !== null) {
          return this.State(currentPath);
        }

        this.tel.info("Proxy.State.get(): returned real value", { value });
        return value;
      },
      set: (_, prop, value) => {
        if (typeof prop === "symbol") {
          this.state[prop] = value;
          return true;
        }

        this.tel.info("Proxy.State.set(): this.state", { state: this.state });

        const currentPath = [...path, prop];

        this.tel.info("Proxy.State.set(): currentPath", { currentPath });

        // Dig down to parent node directly on the single class target
        let parent = this.state;
        for (let i = 0; i < currentPath.length - 1; i++) {
          const key = currentPath[i];
          if (typeof parent[key] !== "object" || parent[key] === null) {
            parent[key] = {};
          }
          parent = parent[key];
        }

        this.tel.info("Proxy.State.set(): parent", { parent });
        this.tel.info(
          "Proxy.State.set(): parent[currentPath[currentPath.length - 1]]",
          { value: parent[currentPath[currentPath.length - 1]] },
        );
        this.tel.info("Proxy.State.set(): value", { value });

        // parent is now set to currentPath[-1]
        // .length is 1-based, so get the leaf and set the value
        parent[currentPath[currentPath.length - 1]] = value;

        return true;
      },

      // Returns the actual keys present at the current nested path
      ownKeys: () => {
        const value = path.reduce((target, key) => target?.[key], this.state);
        if (typeof value === "object" && value !== null) {
          return Reflect.ownKeys(value);
        }
        return [];
      },

      // Needed by JS engines to confirm keys returned by ownKeys are configurable
      getOwnPropertyDescriptor: (_, prop) => {
        const value = path.reduce((target, key) => target?.[key], this.state);
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

  UpdateState(path: string[], value: unknown): void {
    const normalizedPath = normalizeStatePath(path);

    if (normalizedPath.length === 0) {
      // If the path is empty, we overwrite the root state object
      if (typeof value === "object" && value !== null) {
        this.state = { ...value };
      }
      return;
    }

    // Reference root
    let parent = this.state;

    // Traverse to the parent of the leaf node
    for (let i = 0; i < normalizedPath.length - 1; i++) {
      const key = normalizedPath[i];
      if (typeof parent[key] !== "object" || parent[key] === null) {
        parent[key] = {};
      }
      // Update reference to be a reference to sub-object
      parent = parent[key];
    }

    // Set the value on the leaf node
    const leafKey = normalizedPath[normalizedPath.length - 1];

    // This is still a reference to some key within this.state
    parent[leafKey] = value;
  }
}
