import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import ssh2, { type Client as SshClient, type SFTPWrapper } from "ssh2";
import {
  firmwareCommand,
  firmwareFileName,
  parseFirmwareIdentity,
  parseLogicConnections,
  validateFingerprint,
  type FirmwareFormat,
  type FirmwareIdentity,
  type LogicConnection,
} from "./client/console.js";
import { readFile, type RemoteFile, type SftpProgress } from "./sftp.js";

/**
 * A Crestron device console reachable over SSH: a 4-Series processor, or an
 * endpoint (touch panel, DM NVX) through the processor's port forwarding.
 * `sshFingerprint` pins the host key unless verification is disabled.
 */
export type SshEndpoint = {
  host: string;
  sshPort: number;
  username: string;
  password: string;
  sshFingerprint: string;
};

export interface FirmwareSshOperations {
  version(target: SshEndpoint): Promise<FirmwareIdentity>;
  uploadFirmware(
    target: SshEndpoint,
    path: string,
    remoteName: string,
    format: FirmwareFormat,
    progress: (bytes: number) => void,
  ): Promise<void>;
  startFirmware(
    target: SshEndpoint,
    format: FirmwareFormat,
    staged: { name: string; bytes: number },
  ): Promise<void>;
}
/** The staged package failed preflight; no install command was sent. */
export class FirmwareNotDispatchedError extends Error {}

const { Client } = ssh2;
export const hostFingerprint = (key: Uint8Array) =>
  `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;

/** One control subnet port map, as the console's REMPORTMAP names it. */
export type ConsolePortMap = {
  externalPort: number;
  internalPort: number;
  destination: string;
  protocol: "TCP" | "UDP" | "BOTH";
};
export interface RouterSshOperations {
  /**
   * Remove one port map with the console's REMPORTMAP. Some CP4N firmware
   * keeps entries the CresNext key list cannot delete; the console can.
   */
  removePortMap(processor: SshEndpoint, map: ConsolePortMap): Promise<void>;
}

export interface SshOperations {
  fingerprint(processor: SshEndpoint): Promise<string>;
  connections(processor: SshEndpoint): Promise<LogicConnection[]>;
  readFile(
    processor: SshEndpoint,
    path: string,
    maximumBytes: number,
  ): Promise<RemoteFile>;
  close(): void;
}

type Operation<T> = SftpProgress & {
  succeed: (value: T) => void;
  fail: (error: Error) => void;
  expectDisconnect: (value: T) => void;
  extendTimeout: (ms: number) => void;
};

/**
 * One-shot SSH/SFTP operations. Every call opens its own connection, sends the
 * password at most once, enforces deadlines and closes; nothing is retried and
 * no shell or PTY is opened. close() cancels all pending operations.
 */
export class CrestronSsh
  implements SshOperations, FirmwareSshOperations, RouterSshOperations
{
  private pending = new Set<(error: Error) => void>();
  private stopped = false;
  private timeout: number;
  private verifyHostKey: boolean;

  constructor({
    timeoutMs = 20_000,
    verifyHostKey = true,
  }: { timeoutMs?: number; verifyHostKey?: boolean } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
      throw new Error("SSH timeout must be 1–60000 ms.");
    this.timeout = timeoutMs;
    this.verifyHostKey = verifyHostKey;
  }

  private operation<T>(
    start: (client: SshClient, operation: Operation<T>) => void,
    timeoutMs = this.timeout,
  ): Promise<T> {
    if (this.stopped)
      return Promise.reject(new Error("SSH service is closed."));
    return new Promise((resolve, reject) => {
      const client = new Client();
      let done = false,
        phase = "SSH host-key handshake";
      let disconnect: { value: T } | undefined;
      const finish = (error?: Error, value?: T) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        client.destroy();
        if (error) reject(error);
        else resolve(value!);
      };
      const cancel = (error: Error) => finish(error);
      const timedOut = () =>
        disconnect ?
          finish(undefined, disconnect.value)
        : finish(new Error(`${phase} timed out. No retry was attempted.`));
      let timer = setTimeout(timedOut, timeoutMs);
      this.pending.add(cancel);
      client.on("error", (error) =>
        finish(
          new Error(
            error.level === "client-authentication" ?
              "SSH authentication failed. Check credentials and account permissions. No retry was attempted."
            : `${phase} failed: ${error.message}`,
          ),
        ),
      );
      client.on("close", () =>
        disconnect ?
          finish(undefined, disconnect.value)
        : finish(
            new Error(`${phase}: SSH connection closed before completion.`),
          ),
      );
      try {
        start(client, {
          succeed: (value) => finish(undefined, value),
          fail: (error) => finish(error),
          phase: (name) => {
            phase = name;
          },
          active: () => !done,
          expectDisconnect: (value) => {
            disconnect = { value };
          },
          extendTimeout: (ms) => {
            clearTimeout(timer);
            timer = setTimeout(timedOut, ms);
          },
        });
      } catch (error) {
        finish(
          error instanceof Error ? error : new Error("SSH operation failed."),
        );
      }
    });
  }

  fingerprint(processor: SshEndpoint): Promise<string> {
    return this.operation((client, operation) => {
      client.connect({
        host: processor.host,
        port: processor.sshPort,
        username: "host-key-probe",
        readyTimeout: this.timeout,
        authHandler: () => false,
        hostVerifier: (key: Buffer) => {
          operation.succeed(hostFingerprint(key));
          return false;
        },
      });
    });
  }

  private connect<T>(
    processor: SshEndpoint,
    work: (client: SshClient, operation: Operation<T>) => Promise<T>,
    timeoutMs = this.timeout,
  ): Promise<T> {
    if (this.verifyHostKey && !processor.sshFingerprint)
      return Promise.reject(
        new Error(
          "Read and explicitly trust the processor's SSH fingerprint first. No credentials were sent.",
        ),
      );
    let expected = "";
    try {
      if (this.verifyHostKey)
        expected = validateFingerprint(processor.sshFingerprint);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.operation((client, operation) => {
      let credentialsSent = false,
        keyboardAttempted = false,
        challenges = 0;
      client.on("ready", () => {
        if (operation.active())
          void work(client, operation).then(operation.succeed, operation.fail);
      });
      client.on(
        "keyboard-interactive",
        (_name, _instructions, _language, prompts, respond) => {
          if (!operation.active()) return;
          if (++challenges > 8) {
            operation.fail(
              new Error("SSH authentication sent too many challenges."),
            );
            return;
          }
          if (!prompts.length) {
            respond([]);
            return;
          }
          const prompt = prompts[0];
          if (
            credentialsSent ||
            prompts.length !== 1 ||
            prompt.echo ||
            !/\bpassword\b/i.test(prompt.prompt) ||
            /\b(?:new|change|confirm|again|otp|code|token|expired)\b/i.test(
              `${_instructions} ${prompt.prompt}`,
            )
          ) {
            operation.fail(
              new Error(
                "Unsupported SSH authentication challenge. No password was sent to this challenge.",
              ),
            );
            return;
          }
          credentialsSent = true;
          respond([processor.password]);
        },
      );
      client.connect({
        host: processor.host,
        port: processor.sshPort,
        username: processor.username,
        password: processor.password,
        tryKeyboard: true,
        readyTimeout: this.timeout,
        // Query supported methods, then send the password at most once. Do not
        // resend rejected credentials through another method and trigger lockout.
        authHandler: (methods, partial) => {
          if (!operation.active() || partial || credentialsSent) return false;
          if (methods === null) return "none";
          // Some embedded servers omit the method list entirely. A single
          // password attempt is still safe; a rejection must not be retried.
          if (!methods.length || methods.includes("password")) {
            credentialsSent = true;
            return "password";
          }
          if (methods.includes("keyboard-interactive") && !keyboardAttempted) {
            keyboardAttempted = true;
            return "keyboard-interactive";
          }
          return false;
        },
        hostVerifier: (key: Buffer) => {
          const match =
            !this.verifyHostKey || hostFingerprint(key) === expected;
          if (!match)
            operation.fail(
              new Error(
                "SSH host fingerprint changed. No credentials were sent. Verify the processor before trusting a new key.",
              ),
            );
          else operation.phase("SSH authentication");
          return match;
        },
      });
    }, timeoutMs);
  }

  version(target: SshEndpoint): Promise<FirmwareIdentity> {
    return this.connect(
      target,
      (client, operation) =>
        new Promise((resolve, reject) => {
          operation.phase("SSH VER -V firmware identity");
          client.exec("ver -v", (error, stream) => {
            if (error) {
              reject(error);
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0,
              ended = false,
              stderr = false;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 16 * 1024)
                operation.fail(
                  new Error("VER response exceeded the size limit."),
                );
              else chunks.push(chunk);
            });
            stream.stderr.on("data", () => {
              stderr = true;
            });
            stream.on("error", reject);
            stream.on("end", () => {
              ended = true;
            });
            stream.on(
              "close",
              (code: number | undefined, signal: string | undefined) => {
                if (
                  !ended ||
                  stderr ||
                  (code !== undefined && code !== 0) ||
                  signal
                ) {
                  reject(new Error("VER did not complete successfully."));
                  return;
                }
                try {
                  resolve(
                    parseFirmwareIdentity(
                      Buffer.concat(chunks).toString("utf8"),
                    ),
                  );
                } catch (error) {
                  reject(error);
                }
              },
            );
          });
        }),
    );
  }

  uploadFirmware(
    target: SshEndpoint,
    path: string,
    remoteName: string,
    format: FirmwareFormat,
    report: (bytes: number) => void,
  ): Promise<void> {
    try {
      firmwareFileName(remoteName, format);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.connect(
      target,
      async (client, operation) => {
        operation.phase("SFTP firmware upload");
        const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
          client.sftp((error, value) =>
            error ? reject(error) : resolve(value),
          ),
        );
        sftp.on("error", operation.fail);
        sftp.on("close", () =>
          operation.fail(
            new Error("Firmware SFTP channel closed before upload completed."),
          ),
        );
        // Every individual request has an inactivity bound, in addition to the
        // operation's 20-minute cap. No write/command is automatically retried.
        const request = <T>(
          start: (
            done: (error: Error | null | undefined, value: T) => void,
          ) => void,
        ) =>
          new Promise<T>((resolve, reject) => {
            if (!operation.active()) {
              reject(new Error("Firmware upload cancelled."));
              return;
            }
            const cancelled = () =>
              done(new Error("Firmware SFTP channel disconnected."));
            const timer = setTimeout(
              () => done(new Error("Firmware SFTP request timed out.")),
              60_000,
            );
            const done = (error?: Error | null, value?: T) => {
              clearTimeout(timer);
              sftp.off("close", cancelled);
              sftp.off("error", done);
              if (error) reject(error);
              else resolve(value!);
            };
            sftp.once("close", cancelled);
            sftp.once("error", done);
            start(done);
          });
        const entries = await request<ssh2.FileEntry[]>((done) =>
          sftp.readdir("/firmware", done),
        );
        if (entries.some((entry) => /\.(?:puf|zip)$/i.test(entry.filename)))
          throw new Error(
            "/firmware already contains a firmware package. Remove or review it outside this app before updating; no files were overwritten.",
          );
        const local = await open(path, "r");
        let remote: Buffer | undefined;
        try {
          const size = (await local.stat()).size;
          remote = await request<Buffer>((done) =>
            sftp.open(`/firmware/${remoteName}`, "wx", done),
          );
          const buffer = Buffer.alloc(32 * 1024);
          let offset = 0;
          while (offset < size) {
            if (!operation.active())
              throw new Error("Firmware upload cancelled.");
            const { bytesRead } = await local.read(
              buffer,
              0,
              Math.min(buffer.length, size - offset),
              offset,
            );
            if (!bytesRead)
              throw new Error("Local firmware file was truncated.");
            await request<void>((done) =>
              sftp.write(remote!, buffer, 0, bytesRead, offset, (error) =>
                done(error, undefined),
              ),
            );
            offset += bytesRead;
            report(offset);
          }
          const attrs = await request<ssh2.Attributes>((done) =>
            sftp.fstat(remote!, done),
          );
          if (attrs.size !== size || (attrs.mode & 0o170000) !== 0o100000)
            throw new Error(
              "Remote firmware size/type was not verified. Update command was not sent.",
            );
          await request<void>((done) =>
            sftp.close(remote!, (error) => done(error, undefined)),
          );
          remote = undefined;
        } finally {
          await local.close();
          if (remote && operation.active())
            await request<void>((done) =>
              sftp.close(remote!, (error) => done(error, undefined)),
            ).catch(() => {});
        }
      },
      20 * 60_000,
    );
  }

  startFirmware(
    target: SshEndpoint,
    format: FirmwareFormat,
    staged: { name: string; bytes: number },
  ): Promise<void> {
    try {
      firmwareFileName(staged.name, format);
    } catch {
      return Promise.reject(new Error("Invalid staged firmware filename."));
    }
    return new Promise<void>((dispatched, failed) => {
      let accepted = false;
      // Keep the command's connection alive through the update rather than
      // dropping it on the normal 20-second read deadline. Verification begins
      // as soon as exec is accepted and runs on independent read-only sessions.
      void this.connect(target, async (client, operation) => {
        operation.phase("SFTP staged firmware preflight");
        const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
          client.sftp((error, value) =>
            error ? reject(error) : resolve(value),
          ),
        );
        sftp.on("error", operation.fail);
        const entries = await new Promise<ssh2.FileEntry[]>((resolve, reject) =>
          sftp.readdir("/firmware", (error, entries) =>
            error ? reject(error) : resolve(entries),
          ),
        );
        const packages = entries.filter((entry) =>
          /\.(?:puf|zip)$/i.test(entry.filename),
        );
        if (
          packages.length !== 1 ||
          packages[0].filename !== staged.name ||
          packages[0].attrs.size !== staged.bytes ||
          (packages[0].attrs.mode & 0o170000) !== 0o100000
        )
          throw new FirmwareNotDispatchedError(
            "Staged firmware changed or another package appeared. No update command sent.",
          );
        sftp.end();
        return new Promise<void>((resolve, reject) => {
          operation.phase("SSH firmware command");
          const timer = setTimeout(
            () =>
              operation.fail(
                new Error(
                  "Firmware exec request was not acknowledged. Do not retry automatically.",
                ),
              ),
            this.timeout,
          );
          client.once("close", () => clearTimeout(timer));
          client.exec(firmwareCommand(format), (error, stream) => {
            clearTimeout(timer);
            if (error) {
              reject(error);
              return;
            }
            accepted = true;
            operation.expectDisconnect(undefined);
            operation.extendTimeout(40 * 60_000);
            dispatched();
            let bytes = 0,
              stderr = false;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 64 * 1024)
                operation.fail(
                  new Error("Firmware command output exceeded its limit."),
                );
            });
            stream.stderr.on("data", () => {
              stderr = true;
            });
            stream.on("error", reject);
            stream.on(
              "close",
              (code: number | undefined, signal: string | undefined) => {
                if (stderr || (code !== undefined && code !== 0) || signal)
                  reject(
                    new Error(
                      "Firmware command reported an error. Verify the device; do not resend.",
                    ),
                  );
                else resolve();
              },
            );
          });
        });
      }).catch((error) => {
        if (!accepted) failed(error);
      });
    });
  }

  readFile(
    processor: SshEndpoint,
    path: string,
    maximumBytes: number,
  ): Promise<RemoteFile> {
    return this.connect(processor, async (client, progress) => {
      progress.phase("SFTP subsystem");
      const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
        client.sftp((error, value) =>
          error ?
            reject(
              new Error(
                "The device did not open an SFTP subsystem. No console fallback is attempted.",
              ),
            )
          : resolve(value),
        ),
      );
      sftp.on("error", progress.fail);
      sftp.on("end", () =>
        progress.fail(
          new Error("SFTP channel ended before the download completed."),
        ),
      );
      sftp.on("close", () =>
        progress.fail(
          new Error("SFTP channel closed before the download completed."),
        ),
      );
      try {
        return await readFile(sftp, progress, path, maximumBytes);
      } catch (error) {
        const code =
          error !== null && typeof error === "object" && "code" in error ?
            Number(error.code)
          : undefined;
        if (code === 2)
          throw new Error(`${path} was not found on the processor.`);
        if (code === 3)
          throw new Error(
            `SFTP permission denied for ${path}. Check account permissions.`,
          );
        throw error;
      }
    });
  }

  removePortMap(processor: SshEndpoint, map: ConsolePortMap): Promise<void> {
    const valid = (port: number) =>
      Number.isInteger(port) && port >= 1 && port <= 65535;
    const octets = map.destination.split(".");
    if (
      !valid(map.externalPort) ||
      !valid(map.internalPort) ||
      octets.length !== 4 ||
      octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255) ||
      !["TCP", "UDP", "BOTH"].includes(map.protocol)
    )
      return Promise.reject(
        new Error(
          "Use numeric ports, a dotted IPv4 address and TCP, UDP or BOTH.",
        ),
      );
    // Every argument is validated above; nothing else reaches the console.
    const command = `REMPORTMAP ${map.externalPort} ${map.internalPort} ${map.destination} ${map.protocol === "BOTH" ? "Both" : map.protocol}`;
    return this.connect(
      processor,
      (client, operation) =>
        new Promise((resolve, reject) => {
          operation.phase("SSH REMPORTMAP");
          client.exec(command, (error, stream) => {
            if (error) {
              reject(error);
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 16 * 1024) {
                operation.fail(
                  new Error("REMPORTMAP response exceeded the size limit."),
                );
                return;
              }
              chunks.push(chunk);
            });
            stream.stderr.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            stream.on("error", reject);
            stream.stderr.on("error", reject);
            stream.on("close", () => {
              if (!operation.active()) return;
              const output = Buffer.concat(chunks).toString("utf8");
              if (/port map removed/i.test(output)) resolve();
              else
                reject(
                  new Error(
                    `The processor did not remove the port map: ${
                      output
                        .replace(/\s+/g, " ")
                        .replace(/CP4N>\s*$/, "")
                        .trim() || "no response"
                    }`,
                  ),
                );
            });
          });
        }),
    );
  }

  connections(processor: SshEndpoint): Promise<LogicConnection[]> {
    return this.connect(
      processor,
      (client, operation) =>
        new Promise((resolve, reject) => {
          operation.phase("SSH WHO live connections");
          // Fixed read-only command, no caller-supplied arguments, PTY, shell,
          // discovery, DHCP enumeration, or processor configuration changes.
          client.exec("who", (error, stream) => {
            if (error) {
              reject(error);
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0,
              stderr = false,
              ended = false;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 256 * 1024) {
                operation.fail(
                  new Error("WHO response exceeded the size limit."),
                );
                return;
              }
              chunks.push(chunk);
            });
            stream.stderr.on("data", () => {
              stderr = true;
            });
            stream.on("error", reject);
            stream.stderr.on("error", reject);
            stream.on("end", () => {
              ended = true;
            });
            stream.on(
              "close",
              (code: number | undefined, signal: string | undefined) => {
                if (!operation.active()) return;
                if (
                  !ended ||
                  stderr ||
                  (code !== undefined && code !== 0) ||
                  signal
                ) {
                  reject(
                    new Error("WHO command did not complete successfully."),
                  );
                  return;
                }
                try {
                  resolve(
                    parseLogicConnections(
                      Buffer.concat(chunks).toString("utf8"),
                    ),
                  );
                } catch (error) {
                  reject(error);
                }
              },
            );
          });
        }),
    );
  }

  close(): void {
    this.stopped = true;
    for (const cancel of [...this.pending])
      cancel(
        new Error(
          "SSH operation cancelled because the SSH service is shutting down.",
        ),
      );
  }
}
