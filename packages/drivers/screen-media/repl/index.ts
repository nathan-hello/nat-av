import { fromJson, type JsonValue } from "@bufbuild/protobuf";
import { Repl, Tcp } from "@nat-av/core";
import ScreenMedia, {
  DiscoverRequest_Kind,
  ReceiverConfigSchema,
  SceneSchema,
  SenderConfigSchema,
  type ScreenMediaKind,
} from "../index.js";

export interface ScreenMediaReplOptions {
  driver: ScreenMedia;
  prompt?: string;
}

export interface RunScreenMediaReplOptions {
  address: string;
  port: number;
  kind?: ScreenMediaKind;
}

const format = (value: unknown): string => {
  return JSON.stringify(
    value,
    (key, item: unknown) => {
      if (key === "$typeName") return undefined;
      if (typeof item === "bigint") return item.toString();
      return item;
    },
    2,
  );
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const parseJson = (args: string[], usage: string): JsonValue => {
  if (args.length === 0) {
    throw new Error(usage);
  }
  const value: unknown = JSON.parse(args.join(" "));
  if (!isJsonValue(value)) {
    throw new Error("input must be JSON");
  }
  return value;
};

const discover = async (
  driver: ScreenMedia,
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

const help = `Commands:
  status                         Fetch runtime status
  state                          Show locally cached driver state
  config                         Fetch the active sender/receiver config
  cameras [offset] [page-size]   Discover cameras
  camera-modes <selector> [offset] [page-size]
                                 Discover modes for one camera
  audio-inputs [offset] [page-size]
  audio-outputs [offset] [page-size]
  monitors [offset] [page-size]  Discover monitors
  apply '<json>'                 Apply config for this sender/receiver
  scene '<json>'                 Update one receiver scene
  help                           Show this help
  exit | quit                    Exit`;

export const createRepl = ({
  driver,
  prompt = "screen> ",
}: ScreenMediaReplOptions): Repl.Repl => {
  return Repl.createRepl({
    prompt,
    commands: {
      status: async () => format(await driver.api.getStatus()),
      state: () => format(driver.state),
      config: async () => format(await driver.api.getConfig()),
      cameras: (args) => discover(driver, DiscoverRequest_Kind.CAMERAS, args),
      "camera-modes": (args) =>
        discover(driver, DiscoverRequest_Kind.CAMERA_MODES, args),
      "audio-inputs": (args) =>
        discover(driver, DiscoverRequest_Kind.AUDIO_INPUTS, args),
      "audio-outputs": (args) =>
        discover(driver, DiscoverRequest_Kind.AUDIO_OUTPUTS, args),
      monitors: (args) => discover(driver, DiscoverRequest_Kind.MONITORS, args),
      apply: async (args) => {
        const input = parseJson(args, "Usage: apply '<json>'");
        if (driver.kind === "sender") {
          const config = fromJson(SenderConfigSchema, input);
          return `Applied sender config at revision ${await driver.api.applySenderConfig(config)}`;
        }
        const config = fromJson(ReceiverConfigSchema, input);
        return `Applied receiver config at revision ${await driver.api.applyReceiverConfig(config)}`;
      },
      scene: async (args) => {
        const input = parseJson(args, "Usage: scene '<json>'");
        const scene = fromJson(SceneSchema, input);
        return `Updated scene at revision ${await driver.api.updateScene(scene)}`;
      },
      help: () => help,
    },
  });
};

export const runRepl = async ({
  address,
  port,
  kind = port === 7000 ? "sender" : "receiver",
}: RunScreenMediaReplOptions): Promise<void> => {
  if (!address) {
    throw new Error("address is required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("port must be an integer from 1 through 65535");
  }

  const driver = new ScreenMedia({
    name: `screen-${kind}`,
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
