import * as dgram from "node:dgram";
import {
  CHANNELS_PER_RX_PAGE,
  CHANNELS_PER_TX_PAGE,
  OPCODE_CHANNEL_COUNT,
  OPCODE_DEVICE_NAME,
  OPCODE_RX_CHANNELS,
  OPCODE_SUBSCRIPTION_ADD,
  OPCODE_SUBSCRIPTION_REMOVE,
  OPCODE_TX_CHANNEL_INFO,
  OPCODE_TX_CHANNEL_NAMES,
  PROTOCOL_ID,
  RESULT_CODE_SUCCESS,
} from "../src/constants.js";
import { StaticDiscovery } from "../src/discovery.js";

const RESULT_CODE_ERROR = 0x0002;
const RESPONSE_HEADER_SIZE = 10;
const SUBSCRIPTION_STATUS_CONNECTED = 9;
const SUBSCRIPTION_STATUS_UNRESOLVED = 1;

export type SimulatedDeviceConfig = {
  /** Dante device name, as other devices refer to it in subscriptions. */
  name: string;
  /** TX channel names. A friendly name may follow after a `|`. */
  tx: readonly string[];
  /** RX channel names. */
  rx: readonly string[];
  sampleRate?: number;
  /** Initial subscriptions keyed by 1-based RX channel number. */
  subscriptions?: Record<number, { txDevice: string; txChannel: string }>;
};

type SimulatedDevice = {
  config: SimulatedDeviceConfig;
  socket: dgram.Socket;
  port: number;
  subscriptions: Map<number, { txDevice: string; txChannel: string }>;
};

/**
 * Answers Dante ARC requests on UDP for a set of virtual devices, one socket
 * per device. It implements the requests `DanteRouter` sends (name, channel
 * counts, TX/RX channel pages, subscription add/remove) so the router and any
 * frontend can be exercised without Dante hardware.
 */
export class DanteSimulator {
  private devices: SimulatedDevice[] = [];

  constructor(
    private readonly configs: readonly SimulatedDeviceConfig[],
    private readonly host = "127.0.0.1",
  ) {}

  async start(): Promise<void> {
    for (const config of this.configs) {
      const socket = dgram.createSocket("udp4");
      const device: SimulatedDevice = {
        config,
        socket,
        port: 0,
        subscriptions: new Map(
          Object.entries(config.subscriptions ?? {}).map(([channel, sub]) => [
            Number(channel),
            sub,
          ]),
        ),
      };
      socket.on("message", (packet, rinfo) => {
        const response = this.handle(device, packet);
        if (response) socket.send(response, rinfo.port, rinfo.address);
      });
      await new Promise<void>((resolve) => socket.bind(0, this.host, resolve));
      device.port = socket.address().port;
      this.devices.push(device);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(
      this.devices.map(
        (device) =>
          new Promise<void>((resolve) => device.socket.close(() => resolve())),
      ),
    );
    this.devices = [];
  }

  /** A discovery backend that resolves to the simulated devices. */
  discovery(): StaticDiscovery {
    return new StaticDiscovery(
      this.devices.map((device) => ({
        ipv4: this.host,
        port: device.port,
        serverName: device.config.name,
      })),
    );
  }

  private handle(device: SimulatedDevice, packet: Buffer): Buffer | null {
    if (packet.length < 8 || packet.readUInt16BE(0) !== PROTOCOL_ID) {
      return null;
    }
    const transactionId = packet.readUInt16BE(4);
    const opcode = packet.readUInt16BE(6);
    const { config } = device;

    switch (opcode) {
      case OPCODE_DEVICE_NAME: {
        const response = new ResponseBuilder(transactionId, opcode, 0);
        response.string(config.name);
        return response.build();
      }

      case OPCODE_CHANNEL_COUNT: {
        const response = new ResponseBuilder(transactionId, opcode, 6);
        response.body.writeUInt8(config.tx.length, 3);
        response.body.writeUInt8(config.rx.length, 5);
        return response.build();
      }

      case OPCODE_TX_CHANNEL_NAMES:
      case OPCODE_TX_CHANNEL_INFO: {
        const start = packet.readUInt16BE(12);
        const channels = pageOf(config.tx, start, CHANNELS_PER_TX_PAGE);
        const friendly = opcode === OPCODE_TX_CHANNEL_NAMES;
        const recordSize = friendly ? 6 : 8;
        const response = new ResponseBuilder(
          transactionId,
          opcode,
          2 + channels.length * recordSize,
        );
        const records = response.body;
        records.writeUInt8(channels.length, 0);
        records.writeUInt8(channels.length, 1);
        const sampleRate = response.u32(config.sampleRate ?? 48000);

        channels.forEach(({ number, value }, i) => {
          const [name, friendlyName] = value.split("|");
          const off = 2 + i * recordSize;
          if (friendly) {
            records.writeUInt16BE(number, off + 2);
            records.writeUInt16BE(
              friendlyName ? response.string(friendlyName) : 0,
              off + 4,
            );
          } else {
            records.writeUInt16BE(number, off);
            records.writeUInt16BE(0x0007, off + 2);
            records.writeUInt16BE(sampleRate, off + 4);
            records.writeUInt16BE(response.string(name), off + 6);
          }
        });
        return response.build();
      }

      case OPCODE_RX_CHANNELS: {
        const start = packet.readUInt16BE(12);
        const channels = pageOf(config.rx, start, CHANNELS_PER_RX_PAGE);
        const response = new ResponseBuilder(
          transactionId,
          opcode,
          2 + channels.length * 20,
        );
        const records = response.body;
        records.writeUInt8(channels.length, 0);
        records.writeUInt8(channels.length, 1);
        const sampleRate = response.u32(config.sampleRate ?? 48000);

        channels.forEach(({ number, value }, i) => {
          const off = 2 + i * 20;
          const sub = device.subscriptions.get(number);
          records.writeUInt16BE(number, off);
          records.writeUInt16BE(0x0006, off + 2);
          records.writeUInt16BE(sampleRate, off + 4);
          records.writeUInt16BE(
            sub ? response.string(sub.txChannel) : 0,
            off + 6,
          );
          records.writeUInt16BE(
            sub ?
              response.string(sub.txDevice === config.name ? "." : sub.txDevice)
            : 0,
            off + 8,
          );
          records.writeUInt16BE(response.string(value), off + 10);
          records.writeUInt16BE(sub ? 1 : 0, off + 12);
          records.writeUInt16BE(
            !sub ? 0
            : this.txExists(sub) ? SUBSCRIPTION_STATUS_CONNECTED
            : SUBSCRIPTION_STATUS_UNRESOLVED,
            off + 14,
          );
        });
        return response.build();
      }

      case OPCODE_SUBSCRIPTION_ADD: {
        const count = packet.readUInt8(8 + 3);
        for (let i = 0; i < count; i++) {
          const off = i === 0 ? 8 + 5 : 8 + 10 + (i - 1) * 6 + 1;
          const rxChannel = packet.readUInt8(off);
          const txChannel = cString(packet, packet.readUInt16BE(off + 1));
          const txDevice = cString(packet, packet.readUInt16BE(off + 3));
          if (rxChannel < 1 || rxChannel > config.rx.length) {
            return emptyResponse(transactionId, opcode, RESULT_CODE_ERROR);
          }
          device.subscriptions.set(rxChannel, { txDevice, txChannel });
        }
        return emptyResponse(transactionId, opcode);
      }

      case OPCODE_SUBSCRIPTION_REMOVE: {
        const count = packet.readUInt32BE(8);
        for (let i = 0; i < count; i++) {
          device.subscriptions.delete(packet.readUInt32BE(12 + i * 4));
        }
        return emptyResponse(transactionId, opcode);
      }

      default:
        return emptyResponse(transactionId, opcode, RESULT_CODE_ERROR);
    }
  }

  private txExists(sub: { txDevice: string; txChannel: string }): boolean {
    const tx = this.devices.find((d) => d.config.name === sub.txDevice);
    return !!tx?.config.tx.some((ch) => ch.split("|")[0] === sub.txChannel);
  }
}

function pageOf(
  values: readonly string[],
  start: number,
  pageSize: number,
): { number: number; value: string }[] {
  return values
    .slice(start - 1, start - 1 + pageSize)
    .map((value, i) => ({ number: start + i, value }));
}

function cString(packet: Buffer, offset: number): string {
  const end = packet.indexOf(0, offset);
  return packet.subarray(offset, end === -1 ? undefined : end).toString();
}

function emptyResponse(
  transactionId: number,
  opcode: number,
  resultCode = RESULT_CODE_SUCCESS,
): Buffer {
  return new ResponseBuilder(transactionId, opcode, 0).build(resultCode);
}

/**
 * Lays out an ARC response: a 10 byte header, fixed-size records, then a
 * heap of strings and values. Records reference heap entries by their
 * absolute offset in the response.
 */
class ResponseBuilder {
  readonly body: Buffer;
  private heap: Buffer[] = [];
  private heapEnd: number;

  constructor(
    private readonly transactionId: number,
    private readonly opcode: number,
    bodyLength: number,
  ) {
    this.body = Buffer.alloc(bodyLength);
    this.heapEnd = RESPONSE_HEADER_SIZE + bodyLength;
  }

  /** Adds a NUL-terminated string to the heap and returns its offset. */
  string(value: string): number {
    return this.add(Buffer.from(value + "\0", "utf-8"));
  }

  u32(value: number): number {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value);
    return this.add(buffer);
  }

  private add(buffer: Buffer): number {
    const offset = this.heapEnd;
    this.heap.push(buffer);
    this.heapEnd += buffer.length;
    return offset;
  }

  build(resultCode = RESULT_CODE_SUCCESS): Buffer {
    const header = Buffer.alloc(RESPONSE_HEADER_SIZE);
    header.writeUInt16BE(PROTOCOL_ID, 0);
    header.writeUInt16BE(this.heapEnd, 2);
    header.writeUInt16BE(this.transactionId, 4);
    header.writeUInt16BE(this.opcode, 6);
    header.writeUInt16BE(resultCode, 8);
    return Buffer.concat([header, this.body, ...this.heap]);
  }
}
