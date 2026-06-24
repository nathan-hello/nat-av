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
} from "./constants";

function buildArcPacket(
  opcode: number,
  payload: Buffer,
  transactionId: number,
): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt16BE(PROTOCOL_ID, 0);
  header.writeUInt16BE(8 + payload.length, 2);
  header.writeUInt16BE(transactionId, 4);
  header.writeUInt16BE(opcode, 6);
  return Buffer.concat([header, payload]);
}

export function buildDeviceNameQuery(transactionId: number): Buffer {
  return buildArcPacket(OPCODE_DEVICE_NAME, Buffer.from([0, 0]), transactionId);
}

export function buildChannelCountQuery(transactionId: number): Buffer {
  return buildArcPacket(
    OPCODE_CHANNEL_COUNT,
    Buffer.from([0, 0]),
    transactionId,
  );
}

export function buildRxChannelsQuery(
  page: number,
  transactionId: number,
): Buffer {
  const startingChannel = page * CHANNELS_PER_RX_PAGE + 1;
  const payload = Buffer.alloc(8);
  payload.writeUInt16BE(0, 0);
  payload.writeUInt8(0, 2);
  payload.writeUInt8(1, 3);
  payload.writeUInt16BE(startingChannel, 4);
  payload.writeUInt16BE(0, 6);
  return buildArcPacket(OPCODE_RX_CHANNELS, payload, transactionId);
}

export function buildTxChannelsQuery(
  page: number,
  friendlyNames: boolean,
  transactionId: number,
): Buffer {
  const opcode = friendlyNames ? OPCODE_TX_CHANNEL_NAMES : OPCODE_TX_CHANNEL_INFO;
  const startingChannel = page * CHANNELS_PER_TX_PAGE + 1;
  const payload = Buffer.alloc(8);
  payload.writeUInt16BE(0, 0);
  payload.writeUInt8(0, 2);
  payload.writeUInt8(1, 3);
  payload.writeUInt16BE(startingChannel, 4);
  payload.writeUInt16BE(0, 6);
  return buildArcPacket(opcode, payload, transactionId);
}

interface SubscriptionAddEntry {
  rxChannelNumber: number;
  txChannelName: string;
  txDeviceName: string;
}

export function buildAddSubscriptions(
  entries: SubscriptionAddEntry[],
  transactionId: number,
): Buffer {
  const count = entries.length;
  if (count < 1 || count > 16) {
    throw new Error(`Subscription count must be 1-16, got ${count}`);
  }

  const arcHeaderSize = 8;
  const firstRecordSize = 10;
  const additionalRecordSize = 6;
  const recordsTotal = firstRecordSize + additionalRecordSize * (count - 1);
  const paddingSize = Math.max(0, 44 - recordsTotal);
  const stringTableOffset =
    arcHeaderSize + recordsTotal + paddingSize;

  const strings: Buffer[] = [];
  const records: { rxChannel: number; txOffset: number; devOffset: number }[] =
    [];

  for (const entry of entries) {
    const txOffset = stringTableOffset + totalLength(strings);
    strings.push(Buffer.from(entry.txChannelName + "\x00", "utf-8"));
    const devOffset = stringTableOffset + totalLength(strings);
    strings.push(Buffer.from(entry.txDeviceName + "\x00", "utf-8"));
    records.push({
      rxChannel: entry.rxChannelNumber,
      txOffset,
      devOffset,
    });
  }

  const payload = Buffer.alloc(
    recordsTotal + paddingSize + totalLength(strings),
  );
  let off = 0;

  payload.writeUInt16BE(0, off);
  off += 2;
  payload.writeUInt8(2, off);
  off += 1;
  payload.writeUInt8(count, off);
  off += 1;
  payload.writeUInt8(0, off);
  off += 1;

  payload.writeUInt8(records[0].rxChannel, off);
  off += 1;
  payload.writeUInt16BE(records[0].txOffset, off);
  off += 2;
  payload.writeUInt16BE(records[0].devOffset, off);
  off += 2;

  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    payload.writeUInt8(0, off);
    off += 1;
    payload.writeUInt8(r.rxChannel, off);
    off += 1;
    payload.writeUInt16BE(r.txOffset, off);
    off += 2;
    payload.writeUInt16BE(r.devOffset, off);
    off += 2;
  }

  off += paddingSize;

  for (const s of strings) {
    s.copy(payload, off);
    off += s.length;
  }

  return buildArcPacket(OPCODE_SUBSCRIPTION_ADD, payload, transactionId);
}

export function buildRemoveSubscriptions(
  rxChannels: number[],
  transactionId: number,
): Buffer {
  const count = rxChannels.length;
  if (count < 1) {
    throw new Error("Must specify at least one channel to unsubscribe");
  }

  const payload = Buffer.alloc(4 + count * 4);
  payload.writeUInt32BE(count, 0);
  for (let i = 0; i < count; i++) {
    payload.writeUInt32BE(rxChannels[i], 4 + i * 4);
  }

  return buildArcPacket(OPCODE_SUBSCRIPTION_REMOVE, payload, transactionId);
}

function totalLength(bufs: Buffer[]): number {
  return bufs.reduce((sum, b) => sum + b.length, 0);
}
