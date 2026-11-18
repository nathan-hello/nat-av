/**
 * Parsers and validators for Crestron console output (client-safe).
 * No Node, network or ssh2 imports; exported through ../client.ts.
 */

/** Model, version and stable identity reported by `ver -v`. */
export type FirmwareIdentity = {
  model: string;
  version: string;
  identity: string;
};

/** One live entry from WHO's Logic Connections table. */
export type LogicConnection = {
  slot: number;
  ipId: string;
  address: string;
  interface: string;
  type: string;
};

/**
 * Crestron firmware package formats and the console command that installs a
 * staged package: `.puf` (processors, touch panels) uses `puf all`; `.zip`
 * (DM NVX) uses `imgupd`.
 */
export type FirmwareFormat = "puf" | "zip";
export const firmwareCommand = (format: FirmwareFormat) =>
  format === "zip" ? "imgupd" : "puf all";

/** Staged firmware lives at /firmware/<name>; names are plain and typed. */
export function firmwareFileName(name: unknown, format: FirmwareFormat): string {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:puf|zip)$/.test(name) ||
    !name.endsWith(`.${format}`)
  )
    throw new Error("Invalid managed firmware filename.");
  return name;
}

/** An OpenSSH `SHA256:` host-key fingerprint, without base64 padding. */
export function validateFingerprint(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(value.trim())
  )
    throw new Error("Use an OpenSSH SHA256: host-key fingerprint.");
  return value.trim().replace(/=+$/, "");
}

export function validateFirmwareVersion(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,8}){2,4}$/.test(value))
    throw new Error(
      "Enter the complete firmware version reported by VER, not the package build suffix.",
    );
  return value;
}

/** Numeric comparison, so 2.8006.00322 equals 2.8006.322. */
export function sameFirmwareVersion(a: string, b: string): boolean {
  const parts = (value: string) =>
    validateFirmwareVersion(value).split(".").map(Number);
  const left = parts(a),
    right = parts(b);
  return (
    left.length === right.length &&
    left.every((part, index) => part === right[index])
  );
}

/**
 * Parse `ver -v`. Validated against the CP4N console form; TS-1070 and
 * DM-NVX endpoints must return the same complete identity line. Unfamiliar
 * output throws rather than guessing a version.
 */
export function parseFirmwareIdentity(text: string): FirmwareIdentity {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  const matches = lines.flatMap((line) => {
    const match =
      /^(CP4N|TS-1070(?:-[A-Z0-9]+)*|DM-NVX-(?!DIR)[A-Z0-9]+)\b[^\[]*\[v(\d+(?:\.\d+){2,4})\s*\([^\]\r\n]+\),\s*#([A-Za-z0-9-]+)\](?:\s+@([A-Za-z0-9-]+))?$/i.exec(
        line,
      );
    return match
      ? [
          {
            model: match[1].toUpperCase(),
            version: validateFirmwareVersion(match[2]),
            identity: match[4] ?? match[3],
          },
        ]
      : [];
  });
  if (
    matches.length !== 1 ||
    !lines.some((line) => /^[A-Z0-9-]+>$/i.test(line))
  )
    throw new Error(
      "Unrecognized or incomplete VER identity/version response. Firmware update blocked.",
    );
  return matches[0];
}

function ipv4(value: string): number | null {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    return null;
  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

/** A unicast IPv4 address that is not 0/8, loopback or multicast/reserved. */
export function usableAddress(value: string): boolean {
  const ip = ipv4(value);
  return (
    ip !== null &&
    ip > 0 &&
    ip < 0xe0000000 &&
    Math.floor(ip / 0x1000000) !== 127 &&
    Math.floor(ip / 0x1000000) !== 0
  );
}

/**
 * Parse WHO's Logic Connections table (validated against CP4N 2.8006.00322).
 * Only live Gateway connections on the control subnet (CS) are returned. This
 * table is the only authoritative slot/IP-ID association; never join DHCP or
 * netstat output by ordering.
 */
export function parseLogicConnections(output: string): LogicConnection[] {
  const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "");
  if (!/\nCP4N>\s*$/.test(clean))
    throw new Error(
      "Incomplete or unsupported WHO response. No addresses resolved.",
    );
  const start = /^TableStart:\s*\[\s*Logic Connections\s*\]\s*$/gm;
  const markers = [...clean.matchAll(start)];
  if (markers.length !== 1)
    throw new Error("WHO did not report one Logic Connections table.");
  const after = clean.slice(markers[0].index + markers[0][0].length);
  const end = after.search(/^TableStart:\s*\[\s*SPLUS Connections\s*\]/m);
  if (end < 0) throw new Error("Incomplete WHO Logic Connections table.");
  const lines = after
    .slice(0, end)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    lines[0]
      ?.split("|")
      .map((column) => column.trim())
      .join("|") !== "AppID|Type|ID|Interface|Uptime|Address" ||
    !/^-+$/.test(lines[1] ?? "")
  )
    throw new Error("Unsupported WHO column format.");
  const connections: LogicConnection[] = [],
    seen = new Set<string>();
  for (const line of lines.slice(2)) {
    const columns = line.split("|").map((column) => column.trim());
    const [app, type, ipId, adapter, uptime, address] = columns;
    if (
      columns.length !== 6 ||
      !/^(?:[1-9]|10)$/.test(app) ||
      !/^[0-9A-F]{2}$/i.test(ipId) ||
      !/^[\w -]+$/.test(type) ||
      !/^[\w -]+$/.test(adapter) ||
      !/^\d+:\d{2}:\d{2}(?:\.\d+)?$/.test(uptime)
    )
      throw new Error("Malformed WHO connection row. No addresses resolved.");
    if (type !== "Gateway" || adapter !== "CS") continue;
    if (!usableAddress(address))
      throw new Error("WHO reported an invalid live device address.");
    const key = `${app}:${ipId.toUpperCase()}`;
    if (seen.has(key))
      throw new Error(
        "WHO reported ambiguous slot/IP-ID connections. No addresses resolved.",
      );
    seen.add(key);
    connections.push({
      slot: Number(app),
      ipId: ipId.toUpperCase(),
      address,
      interface: adapter,
      type,
    });
  }
  return connections;
}
