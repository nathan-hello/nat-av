export function toBuffer(
  data: string | Uint8Array | Buffer | unknown,
  encoding: BufferEncoding = "utf8",
) {
  if (typeof data === "string") {
    return Buffer.from(data, encoding);
  }

  if (data instanceof Buffer) {
    return Buffer.from(data);
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  return Buffer.from(JSON.stringify(data), encoding);
}

export function toString(data: string | Uint8Array | Buffer | unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Buffer) {
    return data.toString("utf8");
  }

  if (data instanceof Uint8Array) {
    return data.toString();
  }

  return JSON.stringify(data);
}

export function toUint8Array(
  data: string | Uint8Array | Buffer | NonSharedBuffer,
  encoding: BufferEncoding = "utf8",
): Uint8Array {
  if (typeof data === "string") {
    return Uint8Array.from(Buffer.from(data, encoding));
  }

  // This goes first because Buffer is a subclass of Uint8Array
  // Doing it this way prevents a reallocation and copy.
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  // Fallback for Buffer or array-like objects
  return new Uint8Array(data);
}
