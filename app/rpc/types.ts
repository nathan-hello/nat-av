import type Natav from "@av/natav";
import type { EventPayload } from "@av/bus";

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

export type RpcEvents = {
  ready: boolean;
  close: CloseEvent;
  error: Event | { reason: "init-promises-threw"; error: Error };
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

export type DebugEvents = {
  ready: void;
  close: CloseEvent;
  error: Event;
  entry: DebugEntry;
};

export type NotificationListener = {
  resolve: (notification: EventPayload) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout | null;
  filter?: (notification: EventPayload) => boolean;
};

export type TransportOptions = {
  reconnect?: boolean;
  retryDelay?: number;
};

export type EventMap = Record<string, any>;

