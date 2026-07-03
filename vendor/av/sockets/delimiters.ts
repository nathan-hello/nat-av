import type { Telemetry } from "@av/telemetry";

export type DataDelimiter<T = any> = ((buffer: Buffer) => T[] | null) & {
  reset?: () => void;
};
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
    let rxBuf = Buffer.alloc(0);

    const delimiter: DataDelimiter<Rx> = (chunk) => {
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
          tel.warn("JSON_PARSE_FAILED", {
            error: parsed.error.message,
            payload: payload.toString("utf8"),
          });
          continue;
        }

        results.push(parsed.data);
      }
    };
    delimiter.reset = () => {
      rxBuf = Buffer.alloc(0);
    };

    return {
      formatter: (value) => {
        const payload = Buffer.from(JSON.stringify(value), "utf8");
        const buf = Buffer.alloc(4 + payload.length);

        buf.writeUInt32BE(payload.length, 0);
        payload.copy(buf, 4);

        return buf;
      },
      delimiter,
    };
  },

  json: <T = unknown>(buf: Buffer): T[] | null => {
    const str = buf.toString("utf8");
    const results: T[] = [];
    let i = 0;

    while (i < str.length) {
      // Look for the next potential JSON start markers from the current index.
      // Example: "invalid_prefix { \"a\": 1 } [1, 2]"
      // firstCurly = 15, firstBrace = 27
      const firstCurly = str.indexOf("{", i);
      const firstBrace = str.indexOf("[", i);

      // If no more objects or arrays exist, we are done.
      if (firstCurly === -1 && firstBrace === -1) {
        break;
      }

      let start = -1;
      let openChar = "";
      let closeChar = "";

      // Determine which token starts first to set up the matching boundary.
      // Example: "{...}" vs "[...]"
      if (firstCurly !== -1 && (firstBrace === -1 || firstCurly < firstBrace)) {
        start = firstCurly;
        openChar = "{";
        closeChar = "}";
      } else {
        start = firstBrace;
        openChar = "[";
        closeChar = "]";
      }

      let depth = 0;
      let inString = false;
      let end = -1;

      // Scan linearly to find the matching closing token.
      for (let j = start; j < str.length; j++) {
        const char = str[j];

        // Handle strings to ignore matches inside JSON keys/values.
        // Example: { "foo}bar": 1 }
        // The '}' inside the string is ignored because inString is true.
        if (char === '"' && str[j - 1] !== "\\") {
          inString = !inString;
          continue;
        }

        // Track structural depth when outside of string literals.
        if (!inString) {
          if (char === openChar) {
            depth++;
          } else if (char === closeChar) {
            depth--;
            // Balanced structure found.
            if (depth === 0) {
              end = j + 1;
              break;
            }
          }
        }
      }

      if (end !== -1) {
        // Extract the candidate segment.
        const candidate = str.substring(start, end);
        try {
          // Parse the isolated candidate. This is faster than parsing raw stream snippets
          // because we only invoke the engine on structurally balanced strings.
          const parsed = JSON.parse(candidate);
          results.push(parsed);
          // Fast-forward past the successfully parsed slice.
          i = end;
        } catch {
          // Recovery: If parsing fails (e.g., "{ broken: JSON }"),
          // increment by 1 to search for the next candidate start.
          i = start + 1;
        }
      } else {
        // If the structure is unclosed (e.g., "{ truncated data..."), stop processing.
        break;
      }
    }

    return results.length > 0 ? results : null;
  },
};
