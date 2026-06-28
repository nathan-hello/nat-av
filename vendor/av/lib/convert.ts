export namespace Convert {
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

  // TODO: make the encoding go from any to any no matter
  // the input type. right now encoding does something for Buffer
  export function toString(
    data: string | Uint8Array | Buffer | unknown,
    encoding: BufferEncoding = "utf8",
  ): string {
    if (typeof data === "string") {
      return data;
    }

    if (data instanceof Buffer) {
      return data.toString(encoding);
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

  export function toArrayBuffer(
    data: string | Buffer | ArrayBufferLike | Buffer[],
  ): ArrayBuffer {
    if (typeof data === "string") {
      return new TextEncoder().encode(data).buffer;
    }

    if (Array.isArray(data)) {
      return Uint8Array.from(Buffer.concat(data)).buffer;
    }

    if (ArrayBuffer.isView(data)) {
      return Uint8Array.from(data).buffer;
    }

    return Uint8Array.from(new Uint8Array(data)).buffer;
  }
}
