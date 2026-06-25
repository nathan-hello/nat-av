import * as readline from "node:readline";
import DanteRouter from "../index.ts";

const INTERFACE_IP = process.argv[2] || undefined;

const router = new DanteRouter({ name: "dante", interfaceIp: INTERFACE_IP });

function formatChannels(ch: Map<number, { name: string }>): string {
  const entries = [...ch.values()];
  if (entries.length === 0) return "(none)";
  return entries.map((c) => c.name).join(", ");
}

function resolveDevice(query: string) {
  const devices = router.api.getDevices();
  const byName = devices.filter(
    (d) => d.name.toLowerCase() === query.toLowerCase(),
  );
  if (byName.length === 1) return byName[0];
  const byServer = devices.find(
    (d) => d.serverName.toLowerCase() === query.toLowerCase(),
  );
  if (byServer) return byServer;
  const byIp = devices.find((d) => d.ipv4 === query);
  if (byIp) return byIp;
  const partial = devices.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous: "${query}" matches ${partial.map((d) => d.name).join(", ")}`,
    );
  }
  return null;
}

function cmdList() {
  const devices = router.api.getDevices();
  if (devices.length === 0) {
    console.log("(no devices found — try running 'refresh' first)");
    return;
  }
  for (const d of devices) {
    const rate =
      d.sampleRate ? ` [${(d.sampleRate / 1000).toFixed(0)}kHz]` : "";
    console.log(`${d.name}  (${d.serverName} @ ${d.ipv4}:${d.arcPort})${rate}`);
    console.log(`  TX (${d.txCount}): ${formatChannels(d.txChannels)}`);
    console.log(`  RX (${d.rxCount}): ${formatChannels(d.rxChannels)}`);
    console.log();
  }
}

function cmdMatrix() {
  const matrix = router.api.getMatrix();
  const entries = Object.entries(matrix);
  if (entries.length === 0) {
    console.log("(no routes)");
    return;
  }
  for (const [rxServer, routes] of entries) {
    const rxDev = router.api.getDevice(rxServer);
    const rxLabel = rxDev?.name ?? rxServer;
    for (const [ch, route] of Object.entries(routes)) {
      const txLabel =
        router.api.getDevice(route.txDevice)?.name ?? route.txDevice;
      console.log(`${rxLabel}:${ch} ← ${txLabel}:${route.txChannelName}`);
    }
  }
}

async function cmdRoute(args: string[]) {
  if (args.length < 4) {
    console.log(
      "Usage: route <rx-device> <rx-channel> <tx-device> <tx-channel>",
    );
    return;
  }
  const rxDev = resolveDevice(args[0]);
  if (!rxDev) throw new Error(`Device not found: ${args[0]}`);
  const rxCh = Number(args[1]);
  if (isNaN(rxCh)) throw new Error(`Invalid channel: ${args[1]}`);
  const txDev = resolveDevice(args[2]);
  if (!txDev) throw new Error(`Device not found: ${args[2]}`);
  const txCh = args[3];
  await router.api.route(rxDev.serverName, rxCh, txDev.serverName, txCh);
  console.log(`Routed ${rxDev.name}:${rxCh} ← ${txDev.name}:${txCh}`);
  await refreshMatrix();
}

async function cmdUnroute(args: string[]) {
  if (args.length < 2) {
    console.log("Usage: unroute <rx-device> <rx-channel>");
    return;
  }
  const rxDev = resolveDevice(args[0]);
  if (!rxDev) throw new Error(`Device not found: ${args[0]}`);
  const rxCh = Number(args[1]);
  if (isNaN(rxCh)) throw new Error(`Invalid channel: ${args[1]}`);
  await router.api.unroute(rxDev.serverName, rxCh);
  console.log(`Unrouted ${rxDev.name}:${rxCh}`);
  await refreshMatrix();
}

async function cmdClear(args: string[]) {
  if (args.length < 1) {
    console.log("Usage: clear <rx-device>");
    return;
  }
  const rxDev = resolveDevice(args[0]);
  if (!rxDev) throw new Error(`Device not found: ${args[0]}`);
  await router.api.clearRoutes(rxDev.serverName);
  console.log(`Cleared all routes for ${rxDev.name}`);
  await refreshMatrix();
}

async function refreshMatrix() {
  process.stdout.write("  Refreshing... ");
  await router.api.refresh();
  console.log("done.");
}

function cmdHelp() {
  console.log(`Commands:
  list                List all discovered devices and channels
  matrix              Show current routing matrix
  route  <rx> <ch> <tx> <tx-ch>   Route a TX channel to an RX channel
  unroute <rx> <ch>    Remove a route
  clear  <rx>          Clear all routes for a device
  refresh             Re-scan the network for devices
  help                Show this help
  exit | quit         Exit`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "dante> ",
});

router.start();

console.log("Scanning for Dante devices...");
try {
  await router.api.refresh();
  console.log(`Found ${router.api.getDevices().length} device(s).`);
} catch (error) {
  console.log("Scan failed. ", error);
}

rl.prompt();

rl.on("line", async (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [cmd, ...args] = trimmed.split(/\s+/);
  const command = cmd.toLowerCase();

  try {
    switch (command) {
      case "list":
        cmdList();
        break;
      case "matrix":
        cmdMatrix();
        break;
      case "route":
        await cmdRoute(args);
        break;
      case "unroute":
        await cmdUnroute(args);
        break;
      case "clear":
        await cmdClear(args);
        break;
      case "refresh":
        process.stdout.write("Scanning... ");
        await router.api.refresh();
        console.log(`found ${router.api.getDevices().length} device(s).`);
        break;
      case "help":
        cmdHelp();
        break;
      case "exit":
      case "quit":
        console.log("bye");
        rl.close();
        return;
      default:
        console.log(
          `Unknown command: ${cmd}. Type 'help' for available commands.`,
        );
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
  }

  rl.prompt();
});

rl.on("close", () => {
  router.end();
  process.exit(0);
});
