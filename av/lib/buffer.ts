export function toBuffer(data: string | Uint8Array | Buffer | unknown) {
  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }

  if (data instanceof Buffer) {
    return Buffer.from(data);
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  return Buffer.from(JSON.stringify(data), "utf8");
}
