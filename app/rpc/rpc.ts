import { isRPCError, isRPCNotification, isRPCResponse } from "./utils";
import type Natav from "@av/natav";
import type { System } from "@av/system";
import type { natav } from "@av/index";

/**
 * RPC Client - manages all communication with the server
 *
 * Usage:
 * ```ts
 * const client = new RPCClient(sendMessage);
 * client.onMessage(messageData); // Call this for each incoming message
 *
 * const result = await client.call("deviceName", "methodName", [arg]);
 * const device = client.device("deviceName");
 * await device.methodName(arg);
 * ```
 */
export class RPCClient {
  private pendingRequests = new Map<string | number, PendingRequest>();
  private persistentListeners: NotificationListener[] = [];
  private requestIdCounter = 0;
  private sendMessage: (message: string) => void;
  private onUpdate?: () => void;
  private timeout = 30000;
  private deviceStates: { [Name in Natav.Names<natav>]?: Natav.State<natav, Name> } = {};
  private systemStateData: SystemStateData = { connections: {} };
  initialized = false;

  constructor(args: { sendMessage: (message: string) => void; onUpdate?: () => void }) {
    this.sendMessage = args.sendMessage;
    this.onUpdate = args.onUpdate;
  }

  /**
   * Initialize device states by fetching all states from server
   * Call this after the WebSocket connection is established
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Fetch system state and all device states in parallel
      const [systemStateData, deviceStates] = await Promise.all([
        this.system.api.GetSystemState(),
        this.system.api.GetAllDeviceStates(),
      ]);

      // Update system state
      this.systemStateData = systemStateData;

      // Store device states directly
      for (const [name, stateData] of Object.entries(deviceStates)) {
        this.deviceStates[name as Natav.Names<natav>] = stateData as any;
      }

      this.initialized = true;
      this.onUpdate?.();
    } catch (error) {
      console.error("[RPC Client] Failed to initialize states:", error);
      throw error;
    }
  }

  /**
   * Call a system method (e.g., system.getDeviceState)
   */
  private async callSystem(method: string, ...args: any) {
    const id = this.requestIdCounter++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      const request = {
        jsonrpc: "2.0" as const,
        id,
        method: "system",
        params: {
          call: method,
          args: args.length > 0 ? { args: args[0] } : undefined,
        },
      };

      try {
        this.sendMessage(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Process incoming message from server
   */
  onMessage(data: any) {
    if (isRPCNotification(data)) {
      // Handle state:update notifications
      if (data.params.type === "natav:state:update") {
        const { name, data: state } = data.params;
        const currentState = this.deviceStates[name];
        if (currentState) {
          // Update state cache with partial data
          this.deviceStates[name] = {
            ...currentState,
            ...state,
          } as any;
          this.onUpdate?.();
        } else {
          // If we don't have cached state, fetch the full state from server
          // and merge the partial update into it
          this.system.api
            .GetDeviceState(name)
            .then((fullState) => {
              this.deviceStates[name] = {
                ...fullState,
                ...state,
              } as any;
              this.onUpdate?.();
            })
            .catch((error) => {
              console.error(`[RPC Client] Failed to fetch state for ${name}:`, error);
            });
        }
      }

      const matchingListeners = this.persistentListeners
        .map((listener) => {
          if (!listener.filter || listener.filter(data.params)) {
            return listener;
          }
        })
        .filter((f) => f !== undefined);

      if (matchingListeners.length > 0) {
        const listener = matchingListeners[0];
        if (listener.timeout) {
          clearTimeout(listener.timeout);
        }
        listener.resolve(data.params);
      }
      return;
    }

    // Check if this is an RPC response or error
    if (isRPCResponse(data)) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(data.id);
        pending.resolve(data.result);
      }
    }
    if (isRPCError(data)) {
      if (data.id === null) {
        console.error(data.error);
        return;
      }
      const pending = this.pendingRequests.get(data.id);
      if (!pending) {
        console.error(data.error);
        return;
      }
      const error = new Error(data.error.message);
      (error as any).code = data.error.code;
      (error as any).data = data.error.data;
      pending.reject(error);
    }
  }

  /**
   * Make an RPC call to a device API method with full type safety
   */
  async call(device: string, method: string, args: any) {
    const id = this.requestIdCounter++;

    // Convert args to array if needed (handle tuple types)
    const argsArray = Array.isArray(args) ? args : [args];

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timed out after ${this.timeout}ms`));
      }, this.timeout);

      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Send RPC request
      const request = {
        jsonrpc: "2.0" as const,
        id,
        method: "device.call" as const,
        params: {
          device,
          method,
          args: argsArray,
        },
      };

      try {
        this.sendMessage(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  device<N extends Natav.Names<natav>>(name: N): Natav.Handle<natav, N> {
    const self = this;

    const makeApiProxy = (deviceName: string) =>
      new Proxy(
        {},
        {
          get: (_, methodName: any) => {
            if (typeof methodName !== "string") return undefined;
            return (...args: any[]) => self.call(deviceName, methodName, args);
          },
        },
      );

    const makeHandle = (deviceName: string): any => ({
      api: makeApiProxy(deviceName),
      state: self.deviceStates[deviceName as Natav.Names<natav>],
      dep: (depName: string) => makeHandle(depName),
    });

    return makeHandle(name);
  }

  /**
   * Access system API and state
   */
  get system(): {
    api: {
      [M in keyof System["api"]]: System["api"][M] extends (...args: infer Args) => infer R ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };
    state: SystemStateData;
  } {
    const api = new Proxy(
      {},
      {
        get: (_, methodName: string | symbol) => {
          if (typeof methodName !== "string") {
            return undefined;
          }
          return (...args: any[]) => {
            return this.callSystem(methodName, ...args);
          };
        },
      },
    ) as {
      [M in keyof System["api"]]: System["api"][M] extends (...args: infer Args) => infer R ?
        (...args: Args) => Promise<Awaited<R>>
      : never;
    };

    return { api, state: this.systemStateData };
  }

  /**
   * Clean up pending requests and listeners (called on unmount/disconnect)
   */
  cleanup() {
    // Clear all pending requests
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Client cleanup"));
    });
    this.pendingRequests.clear();

    // Clear all notification listeners
    this.persistentListeners.forEach((listener) => {
      if (listener.timeout) {
        clearTimeout(listener.timeout);
      }
      listener.reject(new Error("Client cleanup"));
    });
    this.persistentListeners = [];
  }
}
