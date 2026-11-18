import type { SFTPWrapper, Stats } from "ssh2";

const chunkBytes = 16 * 1024;
export type RemoteFile = {
  path: string;
  text: string;
  base64: string;
  bytes: number;
  modifiedAt?: string;
  readAt: string;
};

export type SftpProgress = {
  phase: (name: string) => void;
  active: () => boolean;
};

function statusCode(error: unknown): number | undefined {
  return error !== null && typeof error === "object" && "code" in error
    ? Number(error.code)
    : undefined;
}

async function metadata(
  sftp: SFTPWrapper,
  handle: Buffer,
  path: string,
  maximumBytes: number,
): Promise<Stats | undefined> {
  const stat = await new Promise<Stats | undefined>((resolve, reject) =>
    sftp.fstat(handle, (error, value) => {
      // Some embedded SFTP servers omit FSTAT or answer with generic FAILURE.
      // OPEN/READ still enforce access; do not replace SFTP with console commands.
      if (error && [4, 8].includes(statusCode(error) ?? -1)) resolve(undefined);
      else if (error) reject(error);
      else resolve(value);
    }),
  );
  if (!stat) return;
  if (
    stat.size !== undefined &&
    (!Number.isSafeInteger(stat.size) || stat.size < 0)
  )
    throw new Error("SFTP returned an invalid file size.");
  if (stat.size > maximumBytes)
    throw new Error(
      `${path} exceeds the ${maximumBytes / 1024} KiB download limit.`,
    );
  const type = stat.mode & 0o170000;
  if (type && type !== 0o100000)
    throw new Error(`${path} is not a regular file.`);
  return stat;
}

export async function readFile(
  sftp: SFTPWrapper,
  progress: SftpProgress,
  path: string,
  maximumBytes: number,
): Promise<RemoteFile> {
  if (
    !path.startsWith("/") ||
    /[\x00-\x1f]/.test(path) ||
    path.split("/").includes("..")
  )
    throw new Error("Use an absolute SFTP file path without traversal.");
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 2 * 1024 * 1024
  )
    throw new Error("SFTP read limit must be 1 byte to 2 MiB.");
  progress.phase(`SFTP open ${path}`);
  const handle = await new Promise<Buffer>((resolve, reject) =>
    sftp.open(path, "r", (error, value) =>
      error ? reject(error) : resolve(value),
    ),
  );
  let failed = false;
  try {
    if (!progress.active()) throw new Error("SFTP download cancelled.");
    progress.phase("SFTP file metadata");
    const before = await metadata(sftp, handle, path, maximumBytes);
    const chunks: Buffer[] = [];
    let length = 0;
    while (true) {
      if (!progress.active()) throw new Error("SFTP download cancelled.");
      progress.phase(`SFTP read ${path.slice(path.lastIndexOf("/") + 1)}`);
      // Read one extra byte at the limit to distinguish exact-size EOF from an
      // oversized file. Short DATA packets are not EOF and must not truncate it.
      const buffer = Buffer.alloc(
        Math.min(chunkBytes, maximumBytes - length + 1),
      );
      const count = await new Promise<number>((resolve, reject) =>
        sftp.read(handle, buffer, 0, buffer.length, length, (error, count) =>
          error ? reject(error) : resolve(count),
        ),
      );
      if (!Number.isInteger(count) || count < 0 || count > buffer.length)
        throw new Error("SFTP returned an invalid read length.");
      if (!count) break;
      length += count;
      if (length > maximumBytes)
        throw new Error(
          `${path} exceeded the ${maximumBytes / 1024} KiB download limit.`,
        );
      chunks.push(buffer.subarray(0, count));
    }
    if (!progress.active()) throw new Error("SFTP download cancelled.");
    progress.phase(`SFTP verify ${path}`);
    const after = await metadata(sftp, handle, path, maximumBytes);
    if (
      (before?.size !== undefined && before.size !== length) ||
      (after?.size !== undefined && after.size !== length) ||
      (before?.mtime !== undefined &&
        after?.mtime !== undefined &&
        before.mtime !== after.mtime)
    )
      throw new Error(
        `${path} changed or was truncated during download. Download it again.`,
      );
    const data = Buffer.concat(chunks, length);
    const mtime = after?.mtime ?? before?.mtime;
    return {
      path,
      text: data.toString("utf8"),
      base64: data.toString("base64"),
      bytes: data.length,
      modifiedAt:
        mtime && Number.isInteger(mtime) && mtime > 0 && mtime <= 0xffffffff
          ? new Date(mtime * 1000).toISOString()
          : undefined,
      readAt: new Date().toISOString(),
    };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (progress.active()) {
      progress.phase(`SFTP close ${path}`);
      await new Promise<void>((resolve, reject) =>
        sftp.close(handle, (error) => (error ? reject(error) : resolve())),
      ).catch((error) => {
        if (!failed) throw error;
      });
    }
  }
}
