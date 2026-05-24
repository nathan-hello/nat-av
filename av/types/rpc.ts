import type { System } from "@av/system";
import type { LogEntry } from "@av/telemetry/types";
import type { Natav } from "@av/types/natav";

export namespace Rpc {

  export type PendingRequest = {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  };

  export type TransportOptions = {
    reconnect?: boolean;
    retryDelay?: number;
  };

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
      api: Api<N>;
      readonly state: Promise<State>;
      isPending(method: keyof Api<N>): boolean;
      pendingCount(method: keyof Api<N>): number;
    };

    export const Methods = {
      SystemApi: "system.api",
      SystemState: "system.state",
    } as const;
  }

  export namespace Device {
    export const Methods = {
      DeviceCall: "device.call",
    } as const;
  }

  export namespace Debug {
    export type Encoding = "utf8";

    export type Descriptor = {
      traceName: string;
      canWrite: boolean;
      canReceive: boolean;
    };

    export type Node = {
      name: string;
      driverName: string;
      children: Node[];
      socket?: Descriptor;
    };

    export type SocketMessage = {
      device: string;
      direction: "rx" | "tx" | "rx-delimited";
      time: string;
      traceName: string;
      encoding: Encoding;
      text: string;
      hex: string;
      length: number;
    };

    export const Methods = {
      GetTree: "debug.tree.get",
      WriteSocket: "debug.socket.write",
    } as const;

    export type Notification =
      | {
          type: "debug:log";
          entry: LogEntry;
        }
      | {
          type: "debug:socket:message";
          message: SocketMessage;
        };
  }

  export const Methods = {
    Notification: "notification",
    ...Device.Methods,
    ...System.Methods,
    ...Debug.Methods,
  } as const;
}
