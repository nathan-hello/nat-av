import type { Telemetry } from "@av/index";
import type { RoomOS } from "./types";

type TRequest = (operation: RoomOS.WriteOperation) => Promise<unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RoomOSProxy {
  private request: TRequest;
  private tel: Telemetry;
  private state: Record<string | symbol, any>;
  private strictState: boolean;

  constructor(
    tel: Telemetry,
    request: TRequest,
    state: Record<string | symbol, any> = {},
    strictState = false,
  ) {
    this.request = request;
    this.tel = tel;
    this.state = state;
    this.strictState = strictState;
  }

  private static target() {
    return () => undefined;
  }

  private static childPath(path: string[], prop: string) {
    return [...path, prop];
  }

  private child(): RoomOSProxy {
    return new RoomOSProxy(
      this.tel,
      this.request,
      this.state,
      this.strictState,
    );
  }

  private static normalizeStateAlias(segment: string): string {
    switch (segment) {
      case "xConfiguration":
        return "Configuration";
      case "xStatus":
        return "Status";
      case "xFeedback":
        return "Event";
      default:
        return segment;
    }
  }

  private static normalizeStatePath(path: string[]): string[] {
    return path.map((segment, index) =>
      index === 0 ? RoomOSProxy.normalizeStateAlias(segment) : segment,
    );
  }

  private static subscriptionRootForStateRoot(
    root: string,
  ): keyof RoomOS.Sub | null {
    switch (root) {
      case "Configuration":
        return "xConfiguration";
      case "Status":
        return "xStatus";
      case "Event":
        return "xFeedback";
      default:
        return null;
    }
  }

  private static publicStateRootForRawRoot(root: string): string {
    switch (root) {
      case "Configuration":
        return "xConfiguration";
      case "Status":
        return "xStatus";
      case "Event":
        return "xFeedback";
      default:
        return root;
    }
  }

  private static rawStateRootForPublicRoot(root: string): string {
    switch (root) {
      case "xConfiguration":
        return "Configuration";
      case "xStatus":
        return "Status";
      case "xFeedback":
        return "Event";
      default:
        return root;
    }
  }

  private static isPlainSubscriptionNode(
    value: unknown,
  ): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private getSubscriptionNode(
    path: string[],
  ): true | Record<string, unknown> | undefined {
    if (path[0] === "internal") {
      return true;
    }

    const root = RoomOSProxy.subscriptionRootForStateRoot(path[0] ?? "");
    // TSAS: The state proxy stores the constructor-provided subscriptions tree on internal.
    const subscriptions = this.state.internal?.subscriptions as
      | RoomOS.Sub
      | undefined;

    if (root === null || subscriptions === undefined) {
      return undefined;
    }

    let node: any = subscriptions[root];
    if (node === undefined) {
      return undefined;
    }

    for (const segment of path.slice(1)) {
      if (node === true) {
        return true;
      }

      if (!RoomOSProxy.isPlainSubscriptionNode(node)) {
        return undefined;
      }

      node = node[segment];

      if (node === undefined) {
        return undefined;
      }
    }

    return node;
  }

  private isStatePathAllowed(path: string[]): boolean {
    if (!this.strictState) {
      return true;
    }

    return this.getSubscriptionNode(path) !== undefined;
  }

  private allowedOwnKeys(path: string[]): string[] {
    const current = RoomOSProxy.normalizeStatePath(path).reduce(
      (target, key) => target?.[key],
      this.state,
    );

    if (typeof current !== "object" || current === null) {
      return [];
    }

    if (!this.strictState) {
      return Reflect.ownKeys(current).filter(
        (key): key is string => typeof key === "string",
      );
    }

    if (path.length === 0) {
      return Reflect.ownKeys(current)
        .filter((key): key is string => typeof key === "string")
        .flatMap((key) => {
          if (this.getSubscriptionNode([key]) === undefined) {
            return [];
          }

          return [RoomOSProxy.publicStateRootForRawRoot(key)];
        });
    }

    const subscriptionNode = this.getSubscriptionNode(
      RoomOSProxy.normalizeStatePath(path),
    );
    if (subscriptionNode === undefined) {
      return [];
    }

    if (subscriptionNode === true) {
      return Reflect.ownKeys(current).filter(
        (key): key is string => typeof key === "string",
      );
    }

    return Object.keys(current).filter((key) => key in subscriptionNode);
  }

  private readState(path: string[]): unknown {
    return path.reduce((target, key) => target?.[key], this.state);
  }

  Command(path: string[] = ["xCommand"]) {
    return new Proxy(RoomOSProxy.target(), {
      get: (_, prop: string | symbol) => {
        if (typeof prop === "symbol" || prop === "then") {
          return undefined;
        }

        return this.child().Command(RoomOSProxy.childPath(path, prop));
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
            return this.child().Configuration(
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

        return this.child().Status(RoomOSProxy.childPath(path, prop));
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

        if (prop === "get") {
          return () => this.readState(["Event", ...path.slice(1)]);
        }

        if (prop === "unsubscribe") {
          return () => this.request({ kind: "unsub", root: "xFeedback", path });
        }

        return this.child().Feedback(RoomOSProxy.childPath(path, prop));
      },
    });
  }

  State(path: string[] = []) {
    return new Proxy(this.state, {
      get: (_, prop) => {
        if (typeof prop === "symbol") {
          return this.state[prop];
        }

        // this.tel.info("Proxy.State.get(): this.state", { state: this.state });

        const currentPath = RoomOSProxy.normalizeStatePath([...path, prop]);

        if (!this.isStatePathAllowed(currentPath)) {
          return undefined;
        }

        // this.tel.info("Proxy.State.get(): currentPath", { currentPath });

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

        // this.tel.info("Proxy.State.get(): returned real value", { value });
        return value;
      },
      set: (_, prop, value) => {
        if (typeof prop === "symbol") {
          this.state[prop] = value;
          return true;
        }

        // this.tel.info("Proxy.State.set(): this.state", { state: this.state });

        const currentPath = RoomOSProxy.normalizeStatePath([...path, prop]);

        if (!this.isStatePathAllowed(currentPath)) {
          return true;
        }

        // this.tel.info("Proxy.State.set(): currentPath", { currentPath });

        // Dig down to parent node directly on the single class target
        let parent = this.state;
        for (let i = 0; i < currentPath.length - 1; i++) {
          const key = currentPath[i];
          if (typeof parent[key] !== "object" || parent[key] === null) {
            parent[key] = {};
          }
          parent = parent[key];
        }

        // this.tel.info("Proxy.State.set(): parent", { parent });
        // this.tel.info(
        //   "Proxy.State.set(): parent[currentPath[currentPath.length - 1]]",
        //   { value: parent[currentPath[currentPath.length - 1]] },
        // );
        // this.tel.info("Proxy.State.set(): value", { value });

        // parent is now set to currentPath[-1]
        // .length is 1-based, so get the leaf and set the value
        parent[currentPath[currentPath.length - 1]] = value;

        return true;
      },

      // Returns the actual keys present at the current nested path
      ownKeys: () => {
        return this.allowedOwnKeys(path);
      },

      // Needed by JS engines to confirm keys returned by ownKeys are configurable
      getOwnPropertyDescriptor: (_, prop) => {
        const allowedKeys = this.allowedOwnKeys(path);
        if (typeof prop === "string" && allowedKeys.includes(prop)) {
          const value = RoomOSProxy.normalizeStatePath(path).reduce(
            (target, key) => target?.[key],
            this.state,
          );
          const actualProp =
            path.length === 0 ? RoomOSProxy.rawStateRootForPublicRoot(prop) : prop;
          return {
            enumerable: true,
            configurable: true,
            value: value?.[actualProp],
          };
        }
        return undefined;
      },
    });
  }

  UpdateState(path: string[], value: unknown): void {
    if (!this.isStatePathAllowed(path)) {
      return;
    }

    if (path.length === 0) {
      // If the path is empty, we overwrite the root state object
      if (typeof value === "object" && value !== null) {
        for (const key of Reflect.ownKeys(this.state)) {
          delete this.state[key];
        }

        Object.assign(this.state, value);
      }
      return;
    }

    // Reference root
    let parent = this.state;

    // Traverse to the parent of the leaf node
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (typeof parent[key] !== "object" || parent[key] === null) {
        parent[key] = {};
      }
      // Update reference to be a reference to sub-object
      parent = parent[key];
    }

    // Set the value on the leaf node
    const leafKey = path[path.length - 1];

    // This is still a reference to some key within this.state
    parent[leafKey] = value;
  }
}
