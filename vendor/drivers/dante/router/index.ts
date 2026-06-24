import { Driver } from "@av/index";
import * as dgram from "node:dgram";
import { RESULT_CODE_SUCCESS, SERVICE_ARC } from "./constants";
import { AvahiDiscovery } from "./discovery";
import {
  buildAddSubscriptions,
  buildChannelCountQuery,
  buildDeviceNameQuery,
  buildRemoveSubscriptions,
  buildRxChannelsQuery,
  buildTxChannelsQuery,
} from "./packets";
import {
  getChannelCount,
  getDeviceName,
  getResultCode,
  parseRxChannels,
  parseTxChannelInfo,
  parseTxFriendlyNames,
} from "./parser";
import type {
  DanteDeviceRecord,
  DanteRouterState,
  DiscoveredService,
  DiscoveryBackend,
} from "./types";

const ARC_TIMEOUT_MS = 3000;

interface PendingRequest {
  resolve: (data: Buffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class ArcTransport {
  private socket: dgram.Socket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private started = false;

  constructor(
    private readonly interfaceIp: string | undefined,
    private timeoutMs: number = ARC_TIMEOUT_MS,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (data, rinfo) => {
      if (data.length < 8) return;
      const txId = data.readUInt16BE(4);
      const key = `${rinfo.address}:${txId}`;
      const pending = this.pending.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(key);
        pending.resolve(data);
      }
    });

    const bindAddr = this.interfaceIp || "0.0.0.0";
    this.socket.bind(0, bindAddr);
  }

  stop(): void {
    this.started = false;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Transport stopped"));
    }
    this.pending.clear();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  request(deviceIp: string, port: number, packet: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Transport not started"));
        return;
      }

      const txId = this.nextId;
      this.nextId = (this.nextId + 1) & 0xffff;
      const key = `${deviceIp}:${txId}`;

      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Timeout: ${deviceIp}:${port}`));
      }, this.timeoutMs);

      this.pending.set(key, { resolve, reject, timer });

      const buf = Buffer.from(packet);
      buf.writeUInt16BE(txId, 4);

      this.socket.send(buf, port, deviceIp);
    });
  }
}

function makeDeviceRecord(
  serverName: string,
  name: string,
  ipv4: string,
  arcPort: number,
  txCount: number,
  rxCount: number,
): DanteDeviceRecord {
  return {
    serverName,
    name,
    ipv4,
    arcPort,
    txChannels: new Map(),
    rxChannels: new Map(),
    subscriptions: [],
    txCount,
    rxCount,
  };
}

export default class DanteRouter<const N extends string> extends Driver<N> {
  socket = undefined;

  state: DanteRouterState = {
    devices: Object.create(null),
    matrix: Object.create(null),
    scanStatus: "idle",
    lastScanAt: null,
    liveMdns: false,
  };

  private transport: ArcTransport;
  private discovery: DiscoveryBackend = new AvahiDiscovery();
  private liveWatchCleanup: (() => void) | null = null;
  private scanning = false;

  constructor({
    name,
    liveMdns = false,
    interfaceIp,
  }: {
    name: N;
    liveMdns?: boolean;
    interfaceIp?: string;
  }) {
    super({ name });
    this.state.liveMdns = liveMdns;
    this.transport = new ArcTransport(interfaceIp);
  }

  public start(): void {
    this.transport.start();
    if (this.state.liveMdns) {
      this.startLiveWatch();
    }
  }

  public end(): void {
    this.liveWatchCleanup?.();
    this.liveWatchCleanup = null;
    this.transport.stop();
  }

  api = {
    refresh: async () => {
      if (this.scanning) return;
      this.scanning = true;
      this.state.scanStatus = "scanning";
      this.dispatch("driver:state-updated", {
        data: { scanStatus: "scanning" },
      });

      try {
        const services = await this.discovery.discover(SERVICE_ARC, 5000);
        await this.populateDevices(services);
        this.buildMatrix();
        this.state.scanStatus = "ready";
        this.state.lastScanAt = Date.now();
      } catch (err) {
        this.tel.error("scan-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.state.scanStatus = "error";
      } finally {
        this.scanning = false;
      }

      this.dispatch("driver:state-updated", {
        data: {
          scanStatus: this.state.scanStatus,
          lastScanAt: this.state.lastScanAt,
        },
      });
    },

    getDevices: (): DanteDeviceRecord[] => {
      return Object.values(this.state.devices);
    },

    getDevice: (serverName: string): DanteDeviceRecord | undefined => {
      return this.state.devices[serverName];
    },

    getMatrix: () => {
      return this.state.matrix;
    },

    route: async (
      rxDevice: string,
      rxChannel: number,
      txDevice: string,
      txChannelName: string,
    ): Promise<void> => {
      const device = this.state.devices[rxDevice];
      if (!device) {
        throw new Error(`RX device not found: ${rxDevice}`);
      }

      const txDev = Object.values(this.state.devices).find(
        (d) => d.serverName === txDevice || d.name === txDevice,
      );
      const txDeviceName = txDev?.name ?? txDevice;

      const routeResponse = await this.transport.request(
        device.ipv4,
        device.arcPort,
        buildAddSubscriptions(
          [
            {
              rxChannelNumber: rxChannel,
              txChannelName,
              txDeviceName,
            },
          ],
          0,
        ),
      );

      if (getResultCode(routeResponse) !== RESULT_CODE_SUCCESS) {
        throw new Error(
          `Subscription add failed for ${device.name}:${rxChannel}: result code 0x${getResultCode(routeResponse).toString(16)}`,
        );
      }
    },

    unroute: async (rxDevice: string, rxChannel: number): Promise<void> => {
      const device = this.state.devices[rxDevice];
      if (!device) {
        throw new Error(`RX device not found: ${rxDevice}`);
      }

      const unrouteResponse = await this.transport.request(
        device.ipv4,
        device.arcPort,
        buildRemoveSubscriptions([rxChannel], 0),
      );

      if (getResultCode(unrouteResponse) !== RESULT_CODE_SUCCESS) {
        throw new Error(
          `Subscription remove failed for ${device.name}:${rxChannel}: result code 0x${getResultCode(unrouteResponse).toString(16)}`,
        );
      }
    },

    clearRoutes: async (rxDevice: string): Promise<void> => {
      const device = this.state.devices[rxDevice];
      if (!device) {
        throw new Error(`RX device not found: ${rxDevice}`);
      }

      const matrix = this.state.matrix[rxDevice];
      if (!matrix || Object.keys(matrix).length === 0) return;

      const channels = Object.keys(matrix).map(Number);
      const clearResponse = await this.transport.request(
        device.ipv4,
        device.arcPort,
        buildRemoveSubscriptions(channels, 0),
      );

      if (getResultCode(clearResponse) !== RESULT_CODE_SUCCESS) {
        throw new Error(
          `Subscription clear failed for ${device.name}: result code 0x${getResultCode(clearResponse).toString(16)}`,
        );
      }
    },

    setLiveMdns: async (enabled: boolean): Promise<void> => {
      if (enabled === this.state.liveMdns) return;
      this.state.liveMdns = enabled;

      if (enabled) {
        this.startLiveWatch();
      } else {
        this.stopLiveWatch();
      }

      this.dispatch("driver:state-updated", {
        data: { liveMdns: this.state.liveMdns },
      });
    },
  };

  private startLiveWatch(): void {
    this.stopLiveWatch();
    try {
      this.liveWatchCleanup =
        this.discovery.watch?.(SERVICE_ARC, (event) => {
          this.tel.info("mdns-event", { event });
        }) ?? null;
    } catch {
      this.tel.warn("live-mdns-unavailable");
    }
  }

  private stopLiveWatch(): void {
    this.liveWatchCleanup?.();
    this.liveWatchCleanup = null;
  }

  private buildMatrix(): void {
    const matrix: DanteRouterState["matrix"] = Object.create(null);

    for (const [serverName, device] of Object.entries(this.state.devices)) {
      const entries: Record<
        number,
        { txDevice: string; txChannelName: string }
      > = Object.create(null);

      for (const sub of device.subscriptions) {
        entries[this.rxChannelNumberFromName(device, sub.rxChannelName)] = {
          txDevice: sub.txDeviceName,
          txChannelName: sub.txChannelName,
        };
      }

      if (Object.keys(entries).length > 0) {
        matrix[serverName] = entries;
      }
    }

    this.state.matrix = matrix;

    this.dispatch("driver:state-updated", {
      data: { matrix, devices: this.state.devices },
    });
  }

  private rxChannelNumberFromName(
    device: DanteDeviceRecord,
    name: string | null,
  ): number {
    if (!name) return 0;
    for (const ch of device.rxChannels.values()) {
      if (ch.name === name) return ch.number;
    }
    return 0;
  }

  private async populateDevices(services: DiscoveredService[]): Promise<void> {
    const next: Record<string, DanteDeviceRecord> = Object.create(null);

    const results = await Promise.allSettled(
      services.map(async (svc) => {
        const device = await this.queryDevice(svc);
        if (device) {
          next[device.serverName] = device;
        }
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        this.tel.warn("device-query-failed", {
          error:
            result.reason instanceof Error ?
              result.reason.message
            : String(result.reason),
        });
      }
    }

    this.state.devices = next;
  }

  private async queryDevice(
    svc: DiscoveredService,
  ): Promise<DanteDeviceRecord | null> {
    const ip = svc.ipv4;
    const port = svc.port;

    try {
      const nameResponse = await this.transport.request(
        ip,
        port,
        buildDeviceNameQuery(0),
      );
      const name = getDeviceName(nameResponse);

      const countResponse = await this.transport.request(
        ip,
        port,
        buildChannelCountQuery(0),
      );
      const counts = getChannelCount(countResponse);
      if (!counts) return null;

      const device = makeDeviceRecord(
        svc.serverName,
        name || svc.name || svc.serverName,
        ip,
        port,
        counts.txCount,
        counts.rxCount,
      );

      if (device.txCount > 0) {
        await this.queryTxChannels(device);
      }

      if (device.rxCount > 0) {
        await this.queryRxChannels(device);
      }

      return device;
    } catch (err) {
      this.tel.warn("query-device-failed", {
        serverName: svc.serverName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async queryTxChannels(device: DanteDeviceRecord): Promise<void> {
    const friendlyNames = new Map<number, string>();
    const numPages = Math.max(1, Math.ceil(device.txCount / 32));

    for (let page = 0; page < numPages; page++) {
      try {
        const response = await this.transport.request(
          device.ipv4,
          device.arcPort,
          buildTxChannelsQuery(page, true, 0),
        );
        const names = parseTxFriendlyNames(response, device.txCount, page);
        for (const [num, name] of names) {
          friendlyNames.set(num, name);
        }
      } catch {
        break;
      }
    }

    for (let page = 0; page < numPages; page++) {
      try {
        const response = await this.transport.request(
          device.ipv4,
          device.arcPort,
          buildTxChannelsQuery(page, false, 0),
        );
        const { channels, sampleRate } = parseTxChannelInfo(
          response,
          device.txCount,
          page,
        );
        if (sampleRate !== undefined && device.sampleRate === undefined) {
          // TSAS: augmenting device record at discovery time
          (device as unknown as Record<string, unknown>).sampleRate =
            sampleRate;
        }
        for (const [num, ch] of channels) {
          const friendly = friendlyNames.get(num);
          if (friendly) {
            ch.friendlyName = friendly;
          }
          device.txChannels.set(num, ch);
        }
      } catch {
        break;
      }
    }
  }

  private async queryRxChannels(device: DanteDeviceRecord): Promise<void> {
    const numPages = Math.max(1, Math.ceil(device.rxCount / 16));

    for (let page = 0; page < numPages; page++) {
      try {
        const response = await this.transport.request(
          device.ipv4,
          device.arcPort,
          buildRxChannelsQuery(page, 0),
        );
        const { channels, subscriptions } = parseRxChannels(
          response,
          device,
          page,
        );
        for (const [num, ch] of channels) {
          device.rxChannels.set(num, ch);
        }
        device.subscriptions.push(...subscriptions);
      } catch {
        break;
      }
    }
  }
}
