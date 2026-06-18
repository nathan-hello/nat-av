import { execFile, type ChildProcess, spawn } from "node:child_process";
import type {
  DiscoveredService,
  DiscoveryBackend,
  DiscoveryEvent,
} from "./types";

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

export class AvahiDiscovery implements DiscoveryBackend {
  async discover(
    serviceType: string,
    timeoutMs: number,
  ): Promise<DiscoveredService[]> {
    return new Promise((resolve) => {
      execFile(
        "avahi-browse",
        ["-rtp", serviceType, "-t"],
        { timeout: timeoutMs, killSignal: "SIGKILL" },
        (error: Error | null, stdout: string) => {
          if (error) {
            resolve([]);
            return;
          }
          const services = stdout
            .split("\n")
            .map(parseAvahiLine)
            .filter((s): s is DiscoveredService => s !== null);
          resolve(services);
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
      proc = spawn("avahi-browse", ["-rp", serviceType], {
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
            const type: "added" | "removed" =
              firstChar === "+" ? "added" : "removed";
            const service = parseAvahiLine("=" + line.slice(1));
            if (service) {
              callback({ type, service });
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
