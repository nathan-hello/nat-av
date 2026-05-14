import type Natav from "@av/natav";
import type { RPCError } from "@av/rpc/types";
import type { DriverSchema, NatavJsonRpcBindings } from "@av/schema/types";

export type SystemStateData = {
  connections: Record<string, { connected: boolean }>;
};

export type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type DeviceChangeEvent<N extends Natav, Name extends Natav.Names<N>> = {
  name: Name;
  state: Natav.State<N, Name> | undefined;
  connected: boolean;
};

export type DeviceEvents<N extends Natav, Name extends Natav.Names<N>> = {
  change: DeviceChangeEvent<N, Name>;
};

export type ClientRpcBindings<N extends Natav = Natav> = NatavJsonRpcBindings<N>;

export type ClientRpcDeviceDebug = {
  schema: DriverSchema | undefined;
  driverName: string | undefined;
  typeName: string | undefined;
  source: DriverSchema["source"] | undefined;
  deps: string[];
  methods: DriverSchema["methods"];
  socket: DriverSchema["socket"] | null;
  state: DriverSchema["state"] | undefined;
  logs: DebugEntry[];
  clearLogs(): void;
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

export type DebugEntry = {
  time: string;
  context: {
    spanId: string | undefined;
    traceId: string | undefined;
    traceName: string;
  };
  severity: {
    id: number;
    text: string;
  };
  name: string;
  data: any;
};

export type TransportOptions = {
  reconnect?: boolean;
  retryDelay?: number;
};
