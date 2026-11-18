import { Natav } from "@nat-av/core";
import * as dgram from "node:dgram";
import { RESULT_CODE_SUCCESS, SERVICE_ARC } from "./src/constants.js";
import {
  DanteSimulator,
  type SimulatedDeviceConfig,
} from "./simulator/index.js";
import { AvahiDiscovery } from "./src/discovery.js";
import {
  buildAddSubscriptions,
  buildChannelCountQuery,
  buildDeviceNameQuery,
  buildRemoveSubscriptions,
  buildRxChannelsQuery,
  buildTxChannelsQuery,
} from "./src/packets.js";
import {
  getChannelCount,
  getDeviceName,
  getResultCode,
  parseRxChannels,
  parseTxChannelInfo,
  parseTxFriendlyNames,
} from "./src/parser.js";
import type {
  DanteDeviceRecord,
  DanteRouterState,
  DiscoveredService,
  DiscoveryBackend,
} from "./src/types.js";

export { AvahiDiscovery, StaticDiscovery } from "./src/discovery.js";
export type { SimulatedDeviceConfig } from "./simulator/index.js";
export type { StaticDeviceAddress } from "./src/discovery.js";
export type {
  DanteChannel,
  DanteDeviceRecord,
  DanteRouterMatrix,
  DanteRouterState,
  DanteSubscription,
  DiscoveredService,
  DiscoveryBackend,
  DiscoveryEvent,
} from "./src/types.js";

// Devices answer within a few milliseconds, but UDP can drop a request or
// reply, so each request is sent up to ARC_ATTEMPTS times.
const ARC_ATTEMPT_TIMEOUT_MS = 1000;
const ARC_ATTEMPTS = 3;
const DISCOVERY_TIMEOUT_MS = 5000;
const LIVE_MDNS_DEBOUNCE_MS = 1500;

interface PendingRequest {
  resolve: (data: Buffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

class ArcTransport {
  private socket: dgram.Socket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private started = false;

  constructor(
    private readonly interfaceIp: string | undefined,
    private attemptTimeoutMs: number = ARC_ATTEMPT_TIMEOUT_MS,
    private attempts: number = ARC_ATTEMPTS,
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

      const buf = Buffer.from(packet);
      buf.writeUInt16BE(txId, 4);

      // Retries reuse the transaction ID, so a late reply to any attempt
      // resolves the request. Every ARC request this driver sends is safe to
      // repeat: queries read state, and subscription add/remove set it.
      let attempt = 0;
      const send = () => {
        attempt++;
        pending.timer = setTimeout(() => {
          if (attempt < this.attempts) {
            send();
            return;
          }
          this.pending.delete(key);
          reject(
            new Error(
              `Timeout after ${this.attempts} attempts: ${deviceIp}:${port}`,
            ),
          );
        }, this.attemptTimeoutMs);
        this.socket?.send(buf, port, deviceIp);
      };

      const pending: PendingRequest = {
        resolve,
        reject,
        timer: undefined,
      };
      this.pending.set(key, pending);
      send();
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

export default class DanteRouter<const N extends string> extends Natav.Driver<
  N,
  DanteRouterState
> {
  socket = undefined;

  state: DanteRouterState = {
    devices: Object.create(null),
    matrix: Object.create(null),
    scanStatus: "idle",
    lastScanAt: null,
    liveMdns: false,
  };

  private transport: ArcTransport;
  private discovery: DiscoveryBackend;
  private simulator: DanteSimulator | null = null;
  private liveWatchCleanup: (() => void) | null = null;
  private liveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;

  constructor({
    name,
    liveMdns = false,
    interfaceIp,
    discovery = new AvahiDiscovery(),
    simulate,
  }: {
    name: N;
    liveMdns?: boolean;
    interfaceIp?: string;
    /** Defaults to mDNS discovery through `avahi-browse`. */
    discovery?: DiscoveryBackend;
    /**
     * Route between these virtual devices instead of the network. The driver
     * answers its own ARC requests on localhost, and `discovery` is ignored.
     */
    simulate?: readonly SimulatedDeviceConfig[];
  }) {
    super({ name });
    this.state.liveMdns = liveMdns;
    this.transport = new ArcTransport(interfaceIp);
    this.discovery = discovery;
    if (simulate) {
      this.simulator = new DanteSimulator(simulate);
    }
  }

  public async start(): Promise<void> {
    if (this.simulator) {
      await this.simulator.start();
      this.discovery = this.simulator.discovery();
    }
    this.transport.start();
    if (this.state.liveMdns) {
      this.startLiveWatch();
    }
  }

  public async end(): Promise<void> {
    this.stopLiveWatch();
    this.transport.stop();
    await this.simulator?.stop();
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
        const services = await this.discovery.discover(
          SERVICE_ARC,
          DISCOVERY_TIMEOUT_MS,
        );
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

      await this.reloadRxDevice(rxDevice);
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

      await this.reloadRxDevice(rxDevice);
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

      await this.reloadRxDevice(rxDevice);
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
          // Rescan on every event. "added" events carry no address, but the
          // rescan resolves devices itself, and avahi may never emit a
          // "resolved" event for a device it cannot resolve yet.
          this.scheduleLiveRefresh();
        }) ?? null;
    } catch {
      this.tel.warn("live-mdns-unavailable");
    }
  }

  private stopLiveWatch(): void {
    this.liveWatchCleanup?.();
    this.liveWatchCleanup = null;
    if (this.liveRefreshTimer) {
      clearTimeout(this.liveRefreshTimer);
      this.liveRefreshTimer = null;
    }
  }

  // avahi reports every device on its own line, so a burst of events
  // collapses into one rescan.
  private scheduleLiveRefresh(): void {
    if (this.liveRefreshTimer) clearTimeout(this.liveRefreshTimer);
    this.liveRefreshTimer = setTimeout(() => {
      this.liveRefreshTimer = null;
      // refresh() ignores calls during a scan, which may already have missed
      // this device, so wait for it to finish and try again.
      if (this.scanning) {
        this.scheduleLiveRefresh();
        return;
      }
      void this.api.refresh();
    }, LIVE_MDNS_DEBOUNCE_MS);
  }

  // Re-reads one receiver's channels and subscriptions after a routing change
  // so the matrix reflects what the device reports, without a full rescan.
  private async reloadRxDevice(serverName: string): Promise<void> {
    const current = this.state.devices[serverName];
    if (!current) return;

    const next: DanteDeviceRecord = {
      ...current,
      rxChannels: new Map(),
      subscriptions: [],
    };
    await this.queryRxChannels(next);

    this.state.devices = { ...this.state.devices, [serverName]: next };
    this.buildMatrix();
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
