import type { DataDelimiter, DataFormatter } from "../../sockets/delimiters.js";

export type BinaryEncoder<T> = (value: T) => Uint8Array;
export type BinaryDecoder<T> = (payload: Uint8Array) => T;

export function lengthPrefixed32BE<Tx, Rx>({
  encode,
  decode,
  minPayloadBytes = 0,
  maxPayloadBytes = 0xffffffff,
}: {
  encode: BinaryEncoder<Tx>;
  decode: BinaryDecoder<Rx>;
  minPayloadBytes?: number;
  maxPayloadBytes?: number;
}): {
  formatter: DataFormatter<Tx>;
  delimiter: DataDelimiter<Rx>;
} {
  if (
    !Number.isInteger(maxPayloadBytes) ||
    maxPayloadBytes < 0 ||
    maxPayloadBytes > 0xffffffff
  ) {
    throw new RangeError(
      "maxPayloadBytes must be an integer from 0 through 4294967295",
    );
  }
  if (
    !Number.isInteger(minPayloadBytes) ||
    minPayloadBytes < 0 ||
    minPayloadBytes > maxPayloadBytes
  ) {
    throw new RangeError(
      "minPayloadBytes must be an integer from 0 through maxPayloadBytes",
    );
  }

  let buffered = Buffer.alloc(0);

  const delimiter: DataDelimiter<Rx> = (chunk) => {
    const messages: Rx[] = [];
    buffered = Buffer.concat([buffered, chunk]);

    while (buffered.length >= 4) {
      const payloadBytes = buffered.readUInt32BE(0);
      if (payloadBytes < minPayloadBytes || payloadBytes > maxPayloadBytes) {
        buffered = Buffer.alloc(0);
        throw new RangeError(
          `protobuf frame payload length ${payloadBytes} is outside ${minPayloadBytes}..${maxPayloadBytes}`,
        );
      }

      const frameBytes = 4 + payloadBytes;
      if (buffered.length < frameBytes) {
        break;
      }

      const payload = buffered.subarray(4, frameBytes);
      buffered = buffered.subarray(frameBytes);
      messages.push(decode(payload));
    }

    return messages.length === 0 ? null : messages;
  };

  delimiter.reset = () => {
    buffered = Buffer.alloc(0);
  };

  const formatter: DataFormatter<Tx> = (value) => {
    const payload = Buffer.from(encode(value));
    if (payload.length < minPayloadBytes || payload.length > maxPayloadBytes) {
      throw new RangeError(
        `protobuf frame payload length ${payload.length} is outside ${minPayloadBytes}..${maxPayloadBytes}`,
      );
    }

    const frame = Buffer.allocUnsafe(4 + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);
    return frame;
  };

  return { delimiter, formatter };
}
