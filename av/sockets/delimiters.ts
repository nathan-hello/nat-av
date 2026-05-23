import type { Telemetry } from "@av/telemetry";

export type DataDelimiter<T = any> = (buffer: Buffer) => T[] | null;
export type DataDelimited<T extends DataDelimiter<any>> = NonNullable<
  ReturnType<T>
>;
export type DataFormatter<T> = (value: T) => Buffer;

export const Delimiters = {
  byteDelimtied: (delimiter: number): DataDelimiter<Buffer> => {
    return (buffer: Buffer) => {
      const results: Buffer[] = [];
      let start = 0;

      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === delimiter) {
          if (i > start) {
            results.push(buffer.subarray(start, i));
          }
          start = i + 1;
        }
      }

      // If we found at least one delimiter, return the complete chunks
      if (results.length > 0) {
        return results;
      }

      return null; // No complete lines yet
    };
  },

  characterDelimted: (
    delimiter: string | string[],
    includeDelimiter: boolean,
  ): DataDelimiter<string> => {
    const delimiters = Array.isArray(delimiter) ? delimiter : [delimiter];
    return (buffer: Buffer) => {
      const data = buffer.toString("utf8");
      let bestIndex = -1;
      let bestDelimiter = "";
      for (const d of delimiters) {
        const index = data.indexOf(d);
        if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
          bestIndex = index;
          bestDelimiter = d;
        }
      }
      if (bestIndex === -1) {
        return null;
      }

      if (includeDelimiter) {
        return [data.slice(0, bestIndex + bestDelimiter.length)];
      }
      return [data.slice(0, bestIndex)];
    };
  },

  lengthPrefixed32BE: (buffer: Buffer) => {
    if (buffer.length < 4) return null; // Need at least 4 bytes for length

    const length = buffer.readUInt32BE(0);
    if (buffer.length < 4 + length) return null; // Need complete message

    return buffer.subarray(4, 4 + length);
  },

  fixedSize: (size: number): DataDelimiter<Buffer> => {
    return (buffer: Buffer) => {
      if (buffer.length < size) {
        return null;
      }

      const results: Buffer[] = [];
      for (let i = 0; i > buffer.length; i += size) {
        results.push(buffer.subarray(i, size + size));
      }
      return results;
    };
  },

  lengthPrefixedJson: <Tx, Rx>(
    tel: Telemetry,
  ): {
    formatter: DataFormatter<Tx>;
    delimiter: DataDelimiter<Rx>;
  } => {
    // TODO: this buffer basically exists forever. could
    // be the cause of memory leaks in the future.
    let rxBuf = Buffer.alloc(0);

    return {
      formatter: (value) => {
        const payload = Buffer.from(JSON.stringify(value), "utf8");
        const buf = Buffer.alloc(4 + payload.length);

        buf.writeUInt32BE(payload.length, 0);
        payload.copy(buf, 4);

        return buf;
      },

      delimiter: (chunk) => {
        const results: Rx[] = [];

        rxBuf = Buffer.concat([rxBuf, chunk]);

        while (true) {
          const payload = Delimiters.lengthPrefixed32BE(rxBuf);
          if (payload === null) {
            return results;
          }

          rxBuf = rxBuf.subarray(4 + payload.length);

          const parsed = tel.task("JSON_PARSE", () => {
            return JSON.parse(payload.toString("utf8"));
          });

          if (!parsed.ok) {
            return null;
          }

          if (parsed !== null) {
            results.push(parsed.data);
          }
        }
      },
    };
  },
};
