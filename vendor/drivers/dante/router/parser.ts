import {
  BODY_HEADER_SIZE,
  RESPONSE_HEADER_SIZE,
  RX_RECORD_SIZE,
  TX_FRIENDLY_RECORD_SIZE,
  TX_RECORD_SIZE,
} from "./constants";
import type {
  DanteChannel,
  DanteDeviceRecord,
  DanteSubscription,
} from "./types";

export function getDeviceName(response: Buffer): string | null {
  if (response.length <= RESPONSE_HEADER_SIZE) return null;
  return getStringAtOffset(response, RESPONSE_HEADER_SIZE);
}

export function getChannelCount(
  response: Buffer,
): { txCount: number; rxCount: number } | null {
  if (response.length < 16) return null;
  return {
    txCount: response.readUInt8(13),
    rxCount: response.readUInt8(15),
  };
}

export function getResultCode(response: Buffer): number {
  if (response.length < 10) return 0;
  return response.readUInt16BE(8);
}

export function parseRxChannels(
  response: Buffer,
  device: DanteDeviceRecord,
  page: number,
): { channels: Map<number, DanteChannel>; subscriptions: DanteSubscription[] } {
  const channels = new Map<number, DanteChannel>();
  const subscriptions: DanteSubscription[] = [];
  const body = response.subarray(RESPONSE_HEADER_SIZE);
  const maxRecords = Math.min(
    device.rxCount - page * 16 > 0 ? Math.min(device.rxCount - page * 16, 16) : 0,
    Math.floor((body.length - BODY_HEADER_SIZE) / RX_RECORD_SIZE),
  );

  let sampleRateParsed = false;

  for (let i = 0; i < maxRecords; i++) {
    const off = BODY_HEADER_SIZE + i * RX_RECORD_SIZE;
    if (off + RX_RECORD_SIZE > body.length) break;

    const channelNumber = body.readUInt16BE(off);
    const expected = page * 16 + i + 1;
    if (channelNumber === 0 || channelNumber !== expected) break;

    if (!sampleRateParsed) {
      sampleRateParsed = true;
      const sampleRateOffset = body.readUInt16BE(off + 4);
      if (
        response.length >= sampleRateOffset + 4 &&
        sampleRateOffset < response.length
      ) {
        const sampleRate = response.readUInt32BE(sampleRateOffset);
        if (device.sampleRate === undefined && sampleRate > 0) {
          // TSAS: augmenting device record at discovery time
          (device as unknown as Record<string, unknown>).sampleRate = sampleRate;
        }
      }
    }

    const txChannelOffset = body.readUInt16BE(off + 6);
    const txDeviceOffset = body.readUInt16BE(off + 8);
    const rxChannelOffset = body.readUInt16BE(off + 10);
    const rxChannelStatusCode = body.readUInt16BE(off + 12);
    const subscriptionStatusCode = body.readUInt16BE(off + 14);

    const rxChannelName = getStringAtOffset(response, rxChannelOffset);
    const txDeviceName = getStringAtOffset(response, txDeviceOffset);
    const txChannelName =
      txChannelOffset !== 0 ?
        getStringAtOffset(response, txChannelOffset)
      : rxChannelName;

    if (rxChannelName) {
      channels.set(channelNumber, {
        number: channelNumber,
        name: rxChannelName,
        statusCode: rxChannelStatusCode,
      });
    }

    if (rxChannelName && txChannelName && txDeviceName) {
      const resolvedTxDevice =
        txDeviceName === "." ? device.name : txDeviceName;
      subscriptions.push({
        rxChannelName,
        rxDeviceName: device.name,
        txChannelName,
        txDeviceName: resolvedTxDevice || txDeviceName,
        statusCode: subscriptionStatusCode,
      });
    }
  }

  return { channels, subscriptions };
}

export function parseTxFriendlyNames(
  response: Buffer,
  txCount: number,
  page: number,
): Map<number, string> {
  const names = new Map<number, string>();
  const body = response.subarray(RESPONSE_HEADER_SIZE);
  const maxRecords = Math.min(
    txCount - page * 32 > 0 ? Math.min(txCount - page * 32, 32) : 0,
    Math.floor((body.length - BODY_HEADER_SIZE) / TX_FRIENDLY_RECORD_SIZE),
  );

  for (let i = 0; i < maxRecords; i++) {
    const off = BODY_HEADER_SIZE + i * TX_FRIENDLY_RECORD_SIZE;
    if (off + TX_FRIENDLY_RECORD_SIZE > body.length) break;

    const channelNumber = body.readUInt16BE(off + 2);
    if (channelNumber === 0) break;

    const nameOffset = body.readUInt16BE(off + 4);
    const name = getStringAtOffset(response, nameOffset);
    if (name) {
      names.set(channelNumber, name);
    }
  }

  return names;
}

export function parseTxChannelInfo(
  response: Buffer,
  txCount: number,
  page: number,
): Map<number, DanteChannel> {
  const channels = new Map<number, DanteChannel>();
  const body = response.subarray(RESPONSE_HEADER_SIZE);
  const maxRecords = Math.min(
    txCount - page * 32 > 0 ? Math.min(txCount - page * 32, 32) : 0,
    Math.floor((body.length - BODY_HEADER_SIZE) / TX_RECORD_SIZE),
  );

  let firstChannelGroup: number | null = null;

  for (let i = 0; i < maxRecords; i++) {
    const off = BODY_HEADER_SIZE + i * TX_RECORD_SIZE;
    if (off + TX_RECORD_SIZE > body.length) break;

    const channelNumber = body.readUInt16BE(off);
    const expected = page * 32 + i + 1;
    if (channelNumber === 0 || channelNumber !== expected) break;

    const channelGroup = body.readUInt16BE(off + 4);

    if (i === 0) {
      firstChannelGroup = channelGroup;
    }

    if (channelGroup !== firstChannelGroup) break;

    const nameOffset = body.readUInt16BE(off + 6);
    const name = getStringAtOffset(response, nameOffset);

    if (name) {
      channels.set(channelNumber, {
        number: channelNumber,
        name,
        statusCode: 0,
      });
    }
  }

  return channels;
}

function getStringAtOffset(data: Buffer, offset: number): string | null {
  if (offset === 0 || offset >= data.length) return null;
  const end = data.indexOf(0, offset);
  const slice = end === -1 ? data.subarray(offset) : data.subarray(offset, end);
  return slice.toString("utf-8") || null;
}
