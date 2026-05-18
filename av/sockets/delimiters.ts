export type DataDelimiter<T = any> = (buffer: Buffer) => T | null;
export type DataDelimited<T extends DataDelimiter<any>> = NonNullable<ReturnType<T>>;
export type StreamDelimiter<Request = any, Message = Request> = {
  format: (value: Request) => Buffer;
  push: (chunk: Buffer) => Message[];
};

export const Delimiters = {
  byteDelimtied: (delimiter: number): DataDelimiter<Buffer[]> => {
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

  characterDelimted: (delimiter: string): DataDelimiter<string[]> => {
    return (buffer: Buffer) => {
      const data = buffer.toString("utf8");
      const lines = data.split(delimiter);

      if (lines.length > 1) {
        return lines.slice(0, -1); // Return all complete lines
      }

      return null; // No complete lines yet
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
      if (buffer.length >= size) {
        return buffer.subarray(0, size);
      }
      return null;
    };
  },
  json: <T = object>(): DataDelimiter<T> => {
    return (buffer) => {
      try {
        return JSON.parse(buffer.toString("utf8"));
      } catch {
        return null;
      }
    };
  },

  lengthPrefixedJson: <Request = unknown, Message = Request>(): StreamDelimiter<Request, Message> => {
    let rxBuf = Buffer.alloc(0);

    return {
      format: (value) => {
        const payload = Buffer.from(JSON.stringify(value), "utf8");
        const buf = Buffer.alloc(4 + payload.length);

        buf.writeUInt32BE(payload.length, 0);
        payload.copy(buf, 4);

        return buf;
      },

      push: (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        const messages: Message[] = [];

        while (true) {
          const payload = Delimiters.lengthPrefixed32BE(rxBuf);
          if (payload === null) {
            return messages;
          }

          rxBuf = rxBuf.subarray(4 + payload.length);

          const parsed = Delimiters.json<Message>()(payload);
          if (parsed !== null) {
            messages.push(parsed);
          }
        }
      },
    };
  },
};

