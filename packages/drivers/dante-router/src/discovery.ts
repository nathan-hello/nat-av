import { execFile, spawn, type ChildProcess } from "node:child_process";
import { DEFAULT_ARC_PORT } from "./constants.js";
import type {
  DiscoveredService,
  DiscoveryBackend,
  DiscoveryEvent,
} from "./types.js";

function unescapeAvahiName(name: string): string {
  return name
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\\\(.)/g, (_, c) => c);
}

function parseAvahiLine(line: string): DiscoveredService | null {
  if (!line || !line.startsWith("=")) return null;

  const parts = line.split(";");
  if (parts.length < 9) return null;

  const protocol = parts[2];
  if (protocol !== "IPv4") return null;

  const name = unescapeAvahiName(parts[3]);
  const hostname = parts[6];
  const addr = parts[7];
  const port = parseInt(parts[8], 10);

  if (isNaN(port)) return null;

  const properties: Record<string, string> = {};
  for (let i = 9; i < parts.length; i++) {
    let field = parts[i];
    if (field.startsWith('"') && field.endsWith('"')) {
      field = field.slice(1, -1);
    }
    const eq = field.indexOf("=");
    if (eq > 0) {
      properties[field.slice(0, eq)] = field.slice(eq + 1);
    }
  }

  return {
    serverName: hostname,
    name,
    ipv4: addr,
    port,
    properties,
  };
}

// "+" and "-" lines only carry interface, protocol, name, type and domain.
// Address fields stay empty until a "=" (resolved) line arrives.
function parseAvahiBrowseLine(line: string): DiscoveredService | null {
  const parts = line.split(";");
  if (parts.length < 6 || parts[2] !== "IPv4") return null;
  return {
    serverName: "",
    name: unescapeAvahiName(parts[3]),
    ipv4: "",
    port: 0,
    properties: {},
  };
}

function parseAvahiOutput(stdout: string): DiscoveredService[] {
  return stdout
    .split("\n")
    .map(parseAvahiLine)
    .filter((s): s is DiscoveredService => s !== null);
}

// A device is reported once per interface it is seen on.
function dedupeServices(services: DiscoveredService[]): DiscoveredService[] {
  const byKey = new Map<string, DiscoveredService>();
  for (const service of services) {
    byKey.set(`${service.ipv4}:${service.port}`, service);
  }
  return [...byKey.values()];
}

function avahiServiceType(serviceType: string): string {
  return (
    serviceType.endsWith(".local.") ? serviceType.slice(0, -7)
    : serviceType.endsWith(".") ? serviceType.slice(0, -1)
    : serviceType
  );
}

export class AvahiDiscovery implements DiscoveryBackend {
  async discover(
    serviceType: string,
    timeoutMs: number,
  ): Promise<DiscoveredService[]> {
    return new Promise((resolve) => {
      execFile(
        "avahi-browse",
        ["-rtp", avahiServiceType(serviceType), "-t"],
        { timeout: timeoutMs, killSignal: "SIGKILL" },
        (_error: Error | null, stdout: string) => {
          // avahi-browse writes a "Failed to resolve" line to stderr for every
          // service it cannot resolve, and is killed when the timeout expires.
          // Neither invalidates the services it did resolve, so always parse
          // whatever reached stdout. A missing binary yields empty stdout.
          resolve(dedupeServices(parseAvahiOutput(stdout)));
        },
      );
    });
  }

  watch(
    serviceType: string,
    callback: (event: DiscoveryEvent) => void,
  ): () => void {
    let proc: ChildProcess | null = null;
    let cancelled = false;

    try {
      proc = spawn("avahi-browse", ["-rp", avahiServiceType(serviceType)], {
        stdio: ["ignore", "pipe", "ignore"],
      });

      let buf = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        if (cancelled) return;
        buf += chunk.toString("utf-8");
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) continue;
          const firstChar = line[0];
          if (firstChar === "+" || firstChar === "-") {
            const service = parseAvahiBrowseLine(line);
            if (service) {
              callback({
                type: firstChar === "+" ? "added" : "removed",
                service,
              });
            }
          } else if (firstChar === "=") {
            const service = parseAvahiLine(line);
            if (service) {
              callback({ type: "resolved", service });
            }
          }
        }
      });

      proc.on("error", () => {
        if (!cancelled) {
          cancelled = true;
        }
      });
    } catch {
      // avahi-browse not available
    }

    return () => {
      cancelled = true;
      if (proc && !proc.killed) {
        proc.kill();
      }
    };
  }
}

export type StaticDeviceAddress = {
  /** IPv4 address of the Dante device. */
  ipv4: string;
  /** ARC port. Defaults to 4440. */
  port?: number;
  /** Key used for the device in state. Defaults to `ipv4:port`. */
  serverName?: string;
};

/**
 * Discovery backend for a fixed list of devices. Use it when mDNS cannot
 * resolve the devices, for example when they sit on another subnet behind an
 * mDNS reflector, or to point the router at simulated devices.
 */
export class StaticDiscovery implements DiscoveryBackend {
  constructor(private readonly devices: readonly StaticDeviceAddress[]) {}

  async discover(): Promise<DiscoveredService[]> {
    return this.devices.map((device) => {
      const port = device.port ?? DEFAULT_ARC_PORT;
      const serverName = device.serverName ?? `${device.ipv4}:${port}`;
      return {
        serverName,
        name: serverName,
        ipv4: device.ipv4,
        port,
        properties: {},
      };
    });
  }
}
