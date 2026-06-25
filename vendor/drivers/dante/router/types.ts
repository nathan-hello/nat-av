export interface DanteChannel {
  number: number;
  name: string;
  friendlyName?: string;
  statusCode: number;
}

export interface DanteSubscription {
  rxChannelName: string;
  rxDeviceName: string;
  txChannelName: string;
  txDeviceName: string;
  statusCode: number;
}

export interface DanteDeviceRecord {
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
}

export interface RouteEntry {
  rxDevice: string;
  rxChannel: number;
  txDevice: string;
  txChannelName: string;
}

export interface DanteRouterMatrix {
  [rxServerName: string]: Record<
    number,
    { txDevice: string; txChannelName: string }
  >;
}

export interface DanteRouterState {
  devices: Record<string, DanteDeviceRecord>;
  matrix: DanteRouterMatrix;
  scanStatus: "idle" | "scanning" | "ready" | "error";
  lastScanAt: number | null;
  liveMdns: boolean;
}

export interface DiscoveredService {
  serverName: string;
  name: string;
  ipv4: string;
  port: number;
  properties: Record<string, string>;
}

export interface DiscoveryEvent {
  type: "added" | "removed" | "resolved";
  service: DiscoveredService;
}

export interface DiscoveryBackend {
  discover(
    serviceType: string,
    timeoutMs: number,
  ): Promise<DiscoveredService[]>;
  watch?(
    serviceType: string,
    callback: (event: DiscoveryEvent) => void,
  ): () => void;
}
