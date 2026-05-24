import type { Natav } from "@av/types";
import type { RPCError } from "@av/rpc/protocol";

export type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type DeviceChangeEvent<
  N extends Natav.Orch,
  Name extends Natav.Names<N>,
> = {
  name: Name;
  state: Natav.State<N, Name> | undefined;
};

export type DeviceEvents<N extends Natav.Orch, Name extends Natav.Names<N>> = {
  change: DeviceChangeEvent<N, Name>;
};

export type RpcEvents = {
  ready: boolean;
  close: CloseEvent;
  error:
    | { reason: "transport"; event: Event }
    | { reason: "init-promises-threw"; error: Error }
    | { reason: "json-parse-failed"; raw: string }
    | { reason: "rpc-error"; error: RPCError };
  change: { name?: string };
};

export type TransportOptions = {
  reconnect?: boolean;
  retryDelay?: number;
};
