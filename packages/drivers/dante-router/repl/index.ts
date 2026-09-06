import { Repl } from "@nat-av/core";
import DanteRouter from "../index.js";

export interface DanteReplOptions {
  router: DanteRouter<string>;
  prompt?: string;
}

const formatChannels = (channels: Map<number, { name: string }>): string => {
  const entries = [...channels.values()];
  if (entries.length === 0) return "(none)";
  return entries.map((channel) => channel.name).join(", ");
};

const resolveDevice = (router: DanteRouter<string>, query: string) => {
  const devices = router.api.getDevices();
  const byName = devices.filter(
    (device) => device.name.toLowerCase() === query.toLowerCase(),
  );
  if (byName.length === 1) return byName[0];

  const byServer = devices.find(
    (device) => device.serverName.toLowerCase() === query.toLowerCase(),
  );
  if (byServer) return byServer;
  const byIp = devices.find((device) => device.ipv4 === query);
  if (byIp) return byIp;

  const partial = devices.filter((device) =>
    device.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous: "${query}" matches ${partial.map((device) => device.name).join(", ")}`,
    );
  }
  return null;
};

const formatDevices = (router: DanteRouter<string>) => {
  const devices = router.api.getDevices();
  if (devices.length === 0) {
    return "(no devices found - try running 'refresh' first)";
  }

  return devices
    .map((device) => {
      const rate =
        device.sampleRate ?
          ` [${(device.sampleRate / 1000).toFixed(0)}kHz]`
        : "";
      return [
        `${device.name}  (${device.serverName} @ ${device.ipv4}:${device.arcPort})${rate}`,
        `  TX (${device.txCount}): ${formatChannels(device.txChannels)}`,
        `  RX (${device.rxCount}): ${formatChannels(device.rxChannels)}`,
      ].join("\n");
    })
    .join("\n\n");
};

const formatMatrix = (router: DanteRouter<string>) => {
  const entries = Object.entries(router.api.getMatrix());
  if (entries.length === 0) {
    return "(no routes)";
  }

  return entries
    .flatMap(([rxServer, routes]) => {
      const rxLabel = router.api.getDevice(rxServer)?.name ?? rxServer;
      return Object.entries(routes).map(([channel, route]) => {
        const txLabel =
          router.api.getDevice(route.txDevice)?.name ?? route.txDevice;
        return `${rxLabel}:${channel} <- ${txLabel}:${route.txChannelName}`;
      });
    })
    .join("\n");
};

const route = async (router: DanteRouter<string>, args: string[]) => {
  if (args.length < 4) {
    return "Usage: route <rx-device> <rx-channel> <tx-device> <tx-channel>";
  }

  const rxDevice = resolveDevice(router, args[0]);
  if (!rxDevice) throw new Error(`Device not found: ${args[0]}`);
  const rxChannel = Number(args[1]);
  if (isNaN(rxChannel)) throw new Error(`Invalid channel: ${args[1]}`);
  const txDevice = resolveDevice(router, args[2]);
  if (!txDevice) throw new Error(`Device not found: ${args[2]}`);
  const txChannel = args[3];
  await router.api.route(
    rxDevice.serverName,
    rxChannel,
    txDevice.serverName,
    txChannel,
  );
  await router.api.refresh();
  return `Routed ${rxDevice.name}:${rxChannel} <- ${txDevice.name}:${txChannel}\n${formatMatrix(router)}`;
};

const unroute = async (router: DanteRouter<string>, args: string[]) => {
  if (args.length < 2) {
    return "Usage: unroute <rx-device> <rx-channel>";
  }

  const rxDevice = resolveDevice(router, args[0]);
  if (!rxDevice) throw new Error(`Device not found: ${args[0]}`);
  const rxChannel = Number(args[1]);
  if (isNaN(rxChannel)) throw new Error(`Invalid channel: ${args[1]}`);
  await router.api.unroute(rxDevice.serverName, rxChannel);
  await router.api.refresh();
  return `Unrouted ${rxDevice.name}:${rxChannel}\n${formatMatrix(router)}`;
};

const clear = async (router: DanteRouter<string>, args: string[]) => {
  if (args.length < 1) {
    return "Usage: clear <rx-device>";
  }

  const rxDevice = resolveDevice(router, args[0]);
  if (!rxDevice) throw new Error(`Device not found: ${args[0]}`);
  await router.api.clearRoutes(rxDevice.serverName);
  await router.api.refresh();
  return `Cleared all routes for ${rxDevice.name}\n${formatMatrix(router)}`;
};

const help = `Commands:
  list                List all discovered devices and channels
  matrix              Show current routing matrix
  route  <rx> <ch> <tx> <tx-ch>   Route a TX channel to an RX channel
  unroute <rx> <ch>    Remove a route
  clear  <rx>          Clear all routes for a device
  refresh             Re-scan the network for devices
  help                Show this help
  exit | quit         Exit`;

export const createRepl = ({
  router,
  prompt = "dante> ",
}: DanteReplOptions): Repl.Repl => {
  return Repl.createRepl({
    prompt,
    commands: {
      list: () => formatDevices(router),
      matrix: () => formatMatrix(router),
      route: (args) => route(router, args),
      unroute: (args) => unroute(router, args),
      clear: (args) => clear(router, args),
      refresh: async () => {
        await router.api.refresh();
        return `Found ${router.api.getDevices().length} device(s).`;
      },
      help: () => help,
    },
  });
};
