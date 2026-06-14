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
