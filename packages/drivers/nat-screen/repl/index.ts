import { Repl, Tcp } from "@nat-av/core";
import NatScreen, {
  CameraInput_Codec,
  DiscoverRequest_Kind,
  type NatScreenKind,
} from "../index.js";

export interface NatScreenReplOptions {
  driver: NatScreen;
  prompt?: string;
}

export interface RunNatScreenReplOptions {
  address: string;
  port: number;
  kind?: NatScreenKind;
}

type ParsedOptions = {
  positionals: string[];
  values: Map<string, string[]>;
};

type Endpoint = {
  address: string;
  port: number;
};

type LayerInput = {
  routeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  zIndex: number;
};

const aliases: Record<string, string> = {
  a: "audio",
  c: "camera",
  f: "fps",
  j: "jitter",
  l: "layer",
  m: "monitor",
  o: "output",
  r: "route",
  s: "scene",
};

const booleanOptions = new Set(["headless", "loopback", "no-loopback"]);

const format = (value: unknown): string => {
  return (
    JSON.stringify(
      value,
      (key, item: unknown) => {
        if (key === "$typeName") return undefined;
        if (typeof item === "bigint") return item.toString();
        return item;
      },
      2,
    ) ?? String(value)
  );
};

const parseOptions = (args: string[]): ParsedOptions => {
  const parsed: ParsedOptions = { positionals: [], values: new Map() };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("-") || argument === "-") {
      parsed.positionals.push(argument);
      continue;
    }

    const separator = argument.indexOf("=");
    const rawName = argument.slice(
      argument.startsWith("--") ? 2 : 1,
      separator === -1 ? undefined : separator,
    );
    const name = aliases[rawName] ?? rawName;
    let value = separator === -1 ? undefined : argument.slice(separator + 1);

    if (booleanOptions.has(name)) {
      value = value ?? "true";
    } else if (value === undefined) {
      value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Option --${name} requires a value`);
      }
      index += 1;
    }

    const values = parsed.values.get(name) ?? [];
    values.push(value);
    parsed.values.set(name, values);
  }

  return parsed;
};

const allowOnly = (
  options: ParsedOptions,
  allowed: readonly string[],
): void => {
  const names = new Set(allowed);
  for (const name of options.values.keys()) {
    if (!names.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }
  }
};

const values = (options: ParsedOptions, name: string): string[] => {
  return options.values.get(name) ?? [];
};

const value = (
  options: ParsedOptions,
  name: string,
  fallback?: string,
): string | undefined => {
  const found = values(options, name);
  if (found.length > 1) {
    throw new Error(`Option --${name} may only be supplied once`);
  }
  return found[0] ?? fallback;
};

const numberValue = (
  options: ParsedOptions,
  name: string,
  fallback: number,
): number => {
  const raw = value(options, name);
  const result = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(result)) {
    throw new Error(`Invalid --${name}: ${raw}`);
  }
  return result;
};

const integerValue = (
  options: ParsedOptions,
  name: string,
  fallback: number,
): number => {
  const result = numberValue(options, name, fallback);
  if (!Number.isInteger(result) || result < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return result;
};

const parseEndpoint = (input: string): Endpoint => {
  let address: string;
  let portText: string;

  if (input.startsWith("[")) {
    const end = input.indexOf("]:");
    if (end === -1) {
      throw new Error(`Invalid endpoint: ${input}`);
    }
    address = input.slice(1, end);
    portText = input.slice(end + 2);
  } else {
    const separator = input.lastIndexOf(":");
    if (separator === -1) {
      throw new Error(`Endpoint must be address:port: ${input}`);
    }
    address = input.slice(0, separator);
    portText = input.slice(separator + 1);
  }

  const port = Number(portText);
  if (!address || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid endpoint: ${input}`);
  }
  return { address, port };
};

const parseRoute = (input: string, index: number) => {
  const separator = input.indexOf("=");
  const id = separator === -1 ? `route${index + 1}` : input.slice(0, separator);
  const endpoint = parseEndpoint(
    separator === -1 ? input : input.slice(separator + 1),
  );
  if (!id) {
    throw new Error(`Route ID is empty: ${input}`);
  }
  return { id, input: endpoint };
};

const normalizeLayout = (
  input: string,
): "fullscreen" | "side-by-side" | "quad" => {
  switch (input.toLowerCase()) {
    case "full":
    case "fullscreen":
      return "fullscreen";
    case "side":
    case "side-by-side":
    case "sidebyside":
      return "side-by-side";
    case "grid":
    case "quad":
      return "quad";
    default:
      throw new Error(`Unknown layout: ${input}`);
  }
};

const layoutLayers = (
  layoutInput: string,
  routeIds: string[],
): LayerInput[] => {
  const layout = normalizeLayout(layoutInput);
  if (routeIds.length === 0) {
    throw new Error("A layout requires at least one route");
  }

  if (layout === "fullscreen") {
    return [layer(routeIds[0], 0, 0, 1, 1)];
  }

  if (layout === "side-by-side") {
    if (routeIds.length < 2) {
      throw new Error("Side-by-side requires two routes");
    }
    return [
      layer(routeIds[0], 0, 0, 0.5, 1),
      layer(routeIds[1], 0.5, 0, 0.5, 1),
    ];
  }

  const selected = Array.from(
    { length: 4 },
    (_, index) => routeIds[index % routeIds.length],
  );
  return [
    layer(selected[0], 0, 0, 0.5, 0.5),
    layer(selected[1], 0.5, 0, 0.5, 0.5),
    layer(selected[2], 0, 0.5, 0.5, 0.5),
    layer(selected[3], 0.5, 0.5, 0.5, 0.5),
  ];
};

const layer = (
  routeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity = 1,
  zIndex = 0,
): LayerInput => ({ routeId, x, y, width, height, opacity, zIndex });

const parseLayer = (input: string): LayerInput => {
  const parts = input.split(",");
  if (parts.length < 5 || parts.length > 7) {
    throw new Error(
      `Layer must be route,x,y,width,height[,opacity[,z]]: ${input}`,
    );
  }
  const [routeId, ...rawNumbers] = parts;
  const numbers = rawNumbers.map(Number);
  if (!routeId || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error(`Invalid layer: ${input}`);
  }
  return layer(
    routeId,
    numbers[0],
    numbers[1],
    numbers[2],
    numbers[3],
    numbers[4] ?? 1,
    numbers[5] ?? 0,
  );
};

const parseSize = (input: string): { width: number; height: number } => {
  const [width, height, extra] = input.toLowerCase().split("x").map(Number);
  if (
    extra !== undefined ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error(`Invalid size: ${input}`);
  }
  return { width, height };
};

const parseFps = (
  input: string,
): { numerator: number; denominator: number } => {
  const [numerator, denominator = 1, extra] = input.split("/").map(Number);
  if (
    extra !== undefined ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator < 1 ||
    denominator < 1
  ) {
    throw new Error(`Invalid frame rate: ${input}`);
  }
  return { numerator, denominator };
};

const applyReceiver = async (driver: NatScreen, args: string[]) => {
  const options = parseOptions(args);
  allowOnly(options, [
    "audio-output",
    "headless",
    "jitter",
    "layout",
    "monitor",
    "route",
    "scene",
  ]);
  if (options.positionals.length > 0) {
    throw new Error(`Unexpected argument: ${options.positionals[0]}`);
  }

  const routes = values(options, "route").map(parseRoute);
  if (routes.length === 0) {
    throw new Error(
      "Add at least one route with -r address:port (or use 'clear')",
    );
  }
  const routeIds = routes.map((route) => route.id);
  if (new Set(routeIds).size !== routeIds.length) {
    throw new Error("Route IDs must be unique");
  }

  const sceneName = value(options, "scene", "program") ?? "program";
  const layout = value(options, "layout", "fullscreen") ?? "fullscreen";
  const monitorIds = values(options, "monitor");
  const headless = options.values.has("headless");
  const outputs =
    headless ? []
    : monitorIds.length > 0 ?
      monitorIds.map((monitorId) => ({ monitorId, sceneName }))
    : [{ sceneName }];

  const revision = await driver.api.applyReceiverConfig({
    formatVersion: 2,
    audioOutputDevice: value(options, "audio-output", "") ?? "",
    jitterBufferMs: integerValue(options, "jitter", 150),
    routes,
    outputs,
    scenes: [{ name: sceneName, layers: layoutLayers(layout, routeIds) }],
  });
  return `Applied ${routes.length} route(s), ${layout} scene "${sceneName}", revision ${revision}`;
};

const applySender = async (driver: NatScreen, args: string[]) => {
  const options = parseOptions(args);
  allowOnly(options, [
    "audio",
    "audio-bitrate",
    "bitrate",
    "camera",
    "channels",
    "codec",
    "fps",
    "idr",
    "interface",
    "loopback",
    "no-loopback",
    "output",
    "quality",
    "sample-rate",
    "size",
    "ttl",
  ]);
  if (options.positionals.length > 0) {
    throw new Error(`Unexpected argument: ${options.positionals[0]}`);
  }

  const outputText = value(options, "output");
  if (!outputText) {
    throw new Error("Sender output is required: -o address:port");
  }
  const output = parseEndpoint(outputText);
  const size = parseSize(value(options, "size", "1920x1080") ?? "1920x1080");
  const fps = parseFps(value(options, "fps", "30") ?? "30");
  const codecName = (value(options, "codec", "mjpeg") ?? "mjpeg").toLowerCase();
  const codec =
    codecName === "mjpeg" ? CameraInput_Codec.MJPEG
    : codecName === "h264" ? CameraInput_Codec.H264
    : undefined;
  if (codec === undefined) {
    throw new Error("--codec must be mjpeg or h264");
  }
  const audioDevice = value(options, "audio");

  const revision = await driver.api.applySenderConfig({
    formatVersion: 1,
    camera: {
      device: value(options, "camera", "/dev/video0") ?? "/dev/video0",
      width: size.width,
      height: size.height,
      frameRateNumerator: fps.numerator,
      frameRateDenominator: fps.denominator,
      codec,
    },
    audioInput: {
      enabled: audioDevice !== undefined,
      device: audioDevice ?? "default",
      sampleRate: integerValue(options, "sample-rate", 48_000),
      channels: integerValue(options, "channels", 2),
      bitrate: integerValue(options, "audio-bitrate", 96_000),
    },
    videoEncoder: {
      bitrate: integerValue(options, "bitrate", 4_000_000),
      quality: integerValue(options, "quality", 23),
      idrPeriod: integerValue(options, "idr", 60),
    },
    output: {
      ...output,
      interface: integerValue(options, "interface", 0),
      ttl: integerValue(options, "ttl", 1),
      loopback:
        options.values.has("no-loopback") ? false
        : options.values.has("loopback") ? true
        : true,
    },
  });
  return `Applied sender config to ${output.address}:${output.port}, revision ${revision}`;
};

const updateLayout = async (driver: NatScreen, args: string[]) => {
  const options = parseOptions(args);
  allowOnly(options, ["scene"]);
  const [layout, ...requestedRoutes] = options.positionals;
  if (!layout) {
    throw new Error("Usage: layout <fullscreen|side-by-side|quad> [route ...]");
  }
  const cachedRoutes =
    driver.state.receiverConfig?.routes.map((route) => route.id) ?? [];
  const routeIds = requestedRoutes.length > 0 ? requestedRoutes : cachedRoutes;
  if (routeIds.length === 0) {
    throw new Error("No routes cached; run 'config' or 'apply -r ...' first");
  }
  const sceneName = value(options, "scene", "program") ?? "program";
  const normalized = normalizeLayout(layout);
  const revision = await driver.api.updateScene({
    name: sceneName,
    layers: layoutLayers(normalized, routeIds),
  });
  return `Changed "${sceneName}" to ${normalized}, revision ${revision}`;
};

const updateScene = async (driver: NatScreen, args: string[]) => {
  const options = parseOptions(args);
  allowOnly(options, ["layer", "scene"]);
  if (options.positionals.length > 1) {
    throw new Error(`Unexpected argument: ${options.positionals[1]}`);
  }
  const sceneName =
    options.positionals[0] ?? value(options, "scene", "program") ?? "program";
  const layers = values(options, "layer").map(parseLayer);
  if (layers.length === 0) {
    throw new Error(
      "Usage: scene [name] -l route,x,y,width,height[,opacity[,z]] [-l ...]",
    );
  }
  const revision = await driver.api.updateScene({ name: sceneName, layers });
  return `Updated "${sceneName}" with ${layers.length} layer(s), revision ${revision}`;
};

const discover = async (
  driver: NatScreen,
  kind: DiscoverRequest_Kind,
  args: string[],
) => {
  const cameraSelector =
    kind === DiscoverRequest_Kind.CAMERA_MODES ? args[0] : "";
  if (kind === DiscoverRequest_Kind.CAMERA_MODES && !cameraSelector) {
    throw new Error(
      "Usage: camera-modes <camera-selector> [offset] [page-size]",
    );
  }
  const offsetIndex = kind === DiscoverRequest_Kind.CAMERA_MODES ? 1 : 0;
  const offset =
    args[offsetIndex] === undefined ? 0 : Number(args[offsetIndex]);
  const pageSize =
    args[offsetIndex + 1] === undefined ? 96 : Number(args[offsetIndex + 1]);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`Invalid offset: ${args[offsetIndex]}`);
  }
  if (!Number.isInteger(pageSize) || pageSize < 0) {
    throw new Error(`Invalid page size: ${args[offsetIndex + 1]}`);
  }
  return format(
    await driver.api.discover({ kind, cameraSelector, offset, pageSize }),
  );
};

const formatRoutes = (driver: NatScreen): string => {
  const routes = driver.state.receiverConfig?.routes ?? [];
  if (routes.length === 0) return "(no cached routes; run 'config' first)";
  return routes
    .map(
      (route) =>
        `${route.id}: ${route.input?.address ?? "?"}:${route.input?.port ?? "?"}`,
    )
    .join("\n");
};

const help = `Common commands:
  status                         Fetch runtime status
  state                          Show cached state
  config                         Fetch and cache active config
  help                           Show this help
  exit | quit                    Exit

Receiver configuration:
  apply -r [id=]address:port [-r ...] [--layout fullscreen|side-by-side|quad]
        [-s scene] [-m monitor-id ...] [-j jitter-ms] [--audio-output device]
        [--headless]
  clear                          Remove every route, scene, and output
  routes                         List cached route IDs
  layout fullscreen [route] [-s scene]
  layout side-by-side [route1 route2] [-s scene]
  layout quad [route1 route2 route3 route4] [-s scene]
                                  Missing quad slots repeat supplied routes
  scene [name] -l route,x,y,width,height[,opacity[,z]] [-l ...]

Sender configuration:
  apply -o address:port [-c camera] [--size 1920x1080] [-f 30|30000/1001]
        [--codec mjpeg|h264] [--bitrate 4000000] [--quality 23] [--idr 60]
        [-a audio-device] [--sample-rate 48000] [--channels 2]
        [--audio-bitrate 96000] [--ttl 1] [--interface 0] [--no-loopback]

Discovery:
  cameras [offset] [page-size]
  camera-modes <selector> [offset] [page-size]
  audio-inputs [offset] [page-size]
  audio-outputs [offset] [page-size]
  monitors [offset] [page-size]`;

export const createRepl = ({
  driver,
  prompt = "nat-screen> ",
}: NatScreenReplOptions): Repl.Repl => {
  return Repl.createRepl({
    prompt,
    commands: {
      status: async () => format(await driver.api.getStatus()),
      state: () => format(driver.state),
      config: async () => format(await driver.api.getConfig()),
      routes: () => formatRoutes(driver),
      apply: (args) =>
        driver.kind === "sender" ?
          applySender(driver, args)
        : applyReceiver(driver, args),
      clear: async () => {
        if (driver.kind !== "receiver") {
          throw new Error("clear is only available for receivers");
        }
        const revision = await driver.api.applyReceiverConfig({
          formatVersion: 2,
          routes: [],
          scenes: [],
          outputs: [],
        });
        return `Cleared receiver config at revision ${revision}`;
      },
      layout: (args) => updateLayout(driver, args),
      scene: (args) => updateScene(driver, args),
      cameras: (args) => discover(driver, DiscoverRequest_Kind.CAMERAS, args),
      "camera-modes": (args) =>
        discover(driver, DiscoverRequest_Kind.CAMERA_MODES, args),
      "audio-inputs": (args) =>
        discover(driver, DiscoverRequest_Kind.AUDIO_INPUTS, args),
      "audio-outputs": (args) =>
        discover(driver, DiscoverRequest_Kind.AUDIO_OUTPUTS, args),
      monitors: (args) => discover(driver, DiscoverRequest_Kind.MONITORS, args),
      help: () => help,
    },
  });
};

export const runRepl = async ({
  address,
  port,
  kind = port === 7000 ? "sender" : "receiver",
}: RunNatScreenReplOptions): Promise<void> => {
  if (!address) {
    throw new Error("address is required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("port must be an integer from 1 through 65535");
  }

  const driver = new NatScreen({
    name: `nat-screen-${kind}`,
    kind,
    socket: new Tcp({ addr: address, port }),
  });
  const repl = createRepl({ driver, prompt: `${kind}> ` });

  driver.start();
  try {
    await repl.run();
  } finally {
    driver.end();
  }
};
