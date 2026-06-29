export type DanteChannel = {
  number: number;
  name: string;
  friendlyName?: string;
  statusCode: number;
};

export type DanteSubscription = {
  rxChannelName: string;
  rxDeviceName: string;
  txChannelName: string;
  txDeviceName: string;
  statusCode: number;
};

export type DanteDeviceRecord = {
  serverName: string;
  name: string;
  ipv4: string;
  arcPort: number;
  txChannels: Map<number, DanteChannel>;
  rxChannels: Map<number, DanteChannel>;
  subscriptions: DanteSubscription[];
  txCount: number;
  rxCount: number;
  sampleRate?: number;
  modelId?: string;
};

export type RouteEntry = {
  rxDevice: string;
  rxChannel: number;
  txDevice: string;
  txChannelName: string;
};

export type DanteRouterMatrix = {
  [rxServerName: string]: Record<
    number,
    { txDevice: string; txChannelName: string }
  >;
};

export type DanteRouterState = {
  devices: Record<string, DanteDeviceRecord>;
  matrix: DanteRouterMatrix;
  scanStatus: "idle" | "scanning" | "ready" | "error";
  lastScanAt: number | null;
  liveMdns: boolean;
};

export type DiscoveredService = {
  serverName: string;
  name: string;
  ipv4: string;
  port: number;
  properties: Record<string, string>;
};

export type DiscoveryEvent = {
  type: "added" | "removed" | "resolved";
  service: DiscoveredService;
};

export type DiscoveryBackend = {
  discover(
    serviceType: string,
    timeoutMs: number,
  ): Promise<DiscoveredService[]>;
  watch?(
    serviceType: string,
    callback: (event: DiscoveryEvent) => void,
  ): () => void;
};
