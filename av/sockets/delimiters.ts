export type DataDelimiter<T = any> = (buffer: Buffer) => T | null;
export type DataDelimited<T extends DataDelimiter<any>> = NonNullable<ReturnType<T>>;

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
};


