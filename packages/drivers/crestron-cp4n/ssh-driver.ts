import { Natav } from "@nat-av/core";
import type { FirmwareFormat } from "./client/console.js";
import type {
  ConsolePortMap,
  FirmwareSshOperations,
  RouterSshOperations,
  SshEndpoint,
  SshOperations,
} from "./ssh.js";

/**
 * A device-bound one-shot SSH driver; it never retains a socket or polls.
 * The injected operations (normally `CrestronSsh`) own authentication,
 * deadlines and host-key checking. File paths, firmware campaigns and room
 * policy belong to applications.
 */
export class CrestronSshDriver<
  const Name extends string = string,
> extends Natav.Driver<Name, { active: boolean }> {
  state = { active: true };
  private endpoint: SshEndpoint;
  private transport: Partial<
    SshOperations & FirmwareSshOperations & RouterSshOperations
  >;
  constructor(
    name: Name,
    endpoint: SshEndpoint,
    transport: Partial<
      SshOperations & FirmwareSshOperations & RouterSshOperations
    >,
  ) {
    super({ name });
    this.endpoint = endpoint;
    this.transport = transport;
  }
  private operation<
    K extends keyof (SshOperations &
      FirmwareSshOperations &
      RouterSshOperations),
  >(
    name: K,
    unavailable: string,
  ): NonNullable<
    (SshOperations & FirmwareSshOperations & RouterSshOperations)[K]
  > {
    if (!this.state.active) throw new Error("Device driver disconnected.");
    const operation = this.transport[name];
    if (!operation) throw new Error(unavailable);
    // TSAS: Checked above; bind keeps the transport as the method receiver.
    return operation.bind(this.transport) as NonNullable<
      (SshOperations & FirmwareSshOperations & RouterSshOperations)[K]
    >;
  }
  override start() {
    /* One-shot connections only. */
  }
  override end() {
    this.state = { active: false };
  }
  api = {
    /** Probe the host key without sending credentials. */
    fingerprint: async () =>
      this.operation(
        "fingerprint",
        "Fingerprint probing is unavailable.",
      )(this.endpoint),
    /** Live Logic Connections from the processor's `who` command. */
    connections: async () =>
      this.operation(
        "connections",
        "Connection inventory is unavailable.",
      )(this.endpoint),
    /** Bounded SFTP read of one absolute path. */
    readFile: async (path: string, maximumBytes: number) =>
      this.operation("readFile", "Generic SFTP file reads are unavailable.")(
        this.endpoint,
        path,
        maximumBytes,
      ),
    /** Remove one port map with the console's REMPORTMAP. */
    removePortMap: async (map: ConsolePortMap) =>
      this.operation(
        "removePortMap",
        "Console port map removal is unavailable.",
      )(this.endpoint, map),
    /** Firmware identity from `ver -v`. */
    version: async () =>
      this.operation(
        "version",
        "Firmware identity is unavailable.",
      )(this.endpoint),
    /** Upload a new file to /firmware; never overwrites an existing package. */
    uploadFirmware: async (
      path: string,
      remoteName: string,
      format: FirmwareFormat,
      report: (bytes: number) => void,
    ) =>
      this.operation("uploadFirmware", "Firmware upload is unavailable.")(
        this.endpoint,
        path,
        remoteName,
        format,
        report,
      ),
    /** Re-check the staged package, then send `puf all` or `imgupd` once. */
    startFirmware: async (
      format: FirmwareFormat,
      staged: { name: string; bytes: number },
    ) =>
      this.operation("startFirmware", "Firmware dispatch is unavailable.")(
        this.endpoint,
        format,
        staged,
      ),
  };
}
