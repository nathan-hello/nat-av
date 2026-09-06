import {
  createRepl as createCoreRepl,
  type Repl,
} from "@nat-av/core/tools/repl";
import Decoder from "../index.js";

export interface DecoderReplEncoder {
  name: string;
  uri: string;
}

export interface DecoderReplOptions {
  decoder: Decoder;
  encoders: readonly DecoderReplEncoder[];
  prompt?: string;
}

const resolveEncoder = (
  encoders: readonly DecoderReplEncoder[],
  query: string,
) => {
  const byName = encoders.find(
    (encoder) => encoder.name.toLowerCase() === query.toLowerCase(),
  );
  if (byName) return byName;

  const partial = encoders.filter((encoder) =>
    encoder.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous: "${query}" matches ${partial.map((encoder) => encoder.name).join(", ")}`,
    );
  }
  return null;
};

const formatEncoders = (encoders: readonly DecoderReplEncoder[]) => {
  return encoders
    .map((encoder, index) => `${index}: ${encoder.name}\n    ${encoder.uri}`)
    .join("\n");
};

const formatContext = (decoder: Decoder) => {
  const context = decoder.state.context;
  if (!context) {
    return "(no context - try 'refresh')";
  }

  return [
    "Video outputs:",
    ...context.video.map(
      (video) =>
        `  [${video.output}] ${video.type} ${video.width}x${video.height}`,
    ),
    "Audio outputs:",
    ...context.audio.map((audio) => `  [${audio.output}] ${audio.type}`),
  ].join("\n");
};

const formatRoutes = (decoder: Decoder) => {
  const { routes } = decoder.state;
  const videos = routes.video.flat().filter(Boolean);
  const audio = routes.audio.filter(Boolean);
  if (videos.length === 0 && audio.length === 0) {
    return "(no routes)";
  }

  return [
    ...videos.map(
      (video) =>
        `video [${video.output}:${video.window}] ${video.uri}  (${video.x},${video.y} ${video.width}x${video.height} z=${video.z})`,
    ),
    ...audio.map(
      (route) => `audio [${route.output}:${route.window}] ${route.uri}`,
    ),
  ].join("\n");
};

const routeVideo = async (
  decoder: Decoder,
  encoders: readonly DecoderReplEncoder[],
  args: string[],
) => {
  if (args.length < 1) {
    return "Usage: route <encoder> [output] [window] [z]";
  }

  const encoder = resolveEncoder(encoders, args[0]);
  if (!encoder) throw new Error(`Encoder not found: ${args[0]}`);
  const output = args[1] !== undefined ? Number(args[1]) : 0;
  const window = args[2] !== undefined ? Number(args[2]) : 0;
  const z = args[3] !== undefined ? Number(args[3]) : undefined;
  if (isNaN(output)) throw new Error(`Invalid output: ${args[1]}`);
  if (isNaN(window)) throw new Error(`Invalid window: ${args[2]}`);
  if (z !== undefined && isNaN(z)) throw new Error(`Invalid z: ${args[3]}`);

  const video: Record<string, unknown> = { output, window, uri: encoder.uri };
  if (z !== undefined) video.z = z;
  // TSAS: api.route fills x/y/z/width/height from output defaults when omitted
  await decoder.api.route({ video: video as never });
  return `Routed video [${output}:${window}] <- ${encoder.name}${z !== undefined ? ` (z=${z})` : ""}\n${formatRoutes(decoder)}`;
};

const routeAudio = async (
  decoder: Decoder,
  encoders: readonly DecoderReplEncoder[],
  args: string[],
) => {
  if (args.length < 2) {
    return "Usage: audio <encoder> <output>";
  }

  const encoder = resolveEncoder(encoders, args[0]);
  if (!encoder) throw new Error(`Encoder not found: ${args[0]}`);
  const output = Number(args[1]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[1]}`);
  await decoder.api.route({ audio: { output, window: 0, uri: encoder.uri } });
  return `Routed audio [${output}] <- ${encoder.name}\n${formatRoutes(decoder)}`;
};

const unroute = async (decoder: Decoder, args: string[]) => {
  if (args.length === 1 && args[0] === "all") {
    await decoder.api.unroute("all");
    return `Unrouted all\n${formatRoutes(decoder)}`;
  }
  if (args.length < 2) {
    return "Usage: unroute <output> <window>  |  unroute all";
  }

  const output = Number(args[0]);
  const window = Number(args[1]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[0]}`);
  if (isNaN(window)) throw new Error(`Invalid window: ${args[1]}`);
  await decoder.api.unroute({
    video: [{ output, window }],
    audio: [],
  });
  return `Unrouted video [${output}:${window}]\n${formatRoutes(decoder)}`;
};

const unrouteAudio = async (decoder: Decoder, args: string[]) => {
  if (args.length < 1) {
    return "Usage: unroute-audio <output>";
  }

  const output = Number(args[0]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[0]}`);
  await decoder.api.unroute({ video: [], audio: [{ output }] });
  return `Unrouted audio [${output}]\n${formatRoutes(decoder)}`;
};

const move = async (decoder: Decoder, args: string[], absolute: boolean) => {
  if (args.length < 4) {
    return `Usage: ${absolute ? "moveAbs" : "move"} <output> <window> <${absolute ? "x" : "dx"}> <${absolute ? "y" : "dy"}> [${absolute ? "w" : "dw"}] [${absolute ? "h" : "dh"}] [z]`;
  }

  const video = {
    output: Number(args[0]),
    window: Number(args[1]),
    x: Number(args[2]),
    y: Number(args[3]),
    width: args[4] !== undefined ? Number(args[4]) : undefined,
    height: args[5] !== undefined ? Number(args[5]) : undefined,
    z: args[6] !== undefined ? Number(args[6]) : undefined,
  };
  if (isNaN(video.output)) throw new Error(`Invalid output: ${args[0]}`);
  if (isNaN(video.window)) throw new Error(`Invalid window: ${args[1]}`);
  if (video.z !== undefined && isNaN(video.z)) {
    throw new Error(`Invalid z: ${args[6]}`);
  }

  const moveWindow =
    absolute ? decoder.api.moveAbsolute : decoder.api.moveRelative;
  await moveWindow(video);
  return `${absolute ? "Moved (abs)" : "Moved (rel)"} [${video.output}:${video.window}]${video.z !== undefined ? ` (z=${video.z})` : ""}\n${formatRoutes(decoder)}`;
};

const help = `Commands:
  list                List all encoders from config
  context             Show video/audio outputs on the decoder
  routes              Show current video/audio routes
  route  <encoder> [output] [window] [z]   Route a video window
  audio  <encoder> <output>            Route an audio output
  unroute <output> <window>            Remove a video route
  unroute-audio <output>               Remove an audio route
  unroute all                         Remove all routes
  move   <output> <window> <dx> <dy> [dw] [dh] [z]   Move window relative
  moveAbs <output> <window> <x> <y> [w] [h] [z]      Move window absolute
  debug               Toggle device debug mode
  refresh             Re-fetch context and routes
  help                Show this help
  exit | quit         Exit`;

export const createRepl = ({
  decoder,
  encoders,
  prompt = "decoder> ",
}: DecoderReplOptions): Repl => {
  return createCoreRepl({
    prompt,
    commands: {
      list: () => formatEncoders(encoders),
      encoders: () => formatEncoders(encoders),
      context: () => formatContext(decoder),
      routes: () => formatRoutes(decoder),
      route: (args) => routeVideo(decoder, encoders, args),
      audio: (args) => routeAudio(decoder, encoders, args),
      unroute: (args) => unroute(decoder, args),
      "unroute-audio": (args) => unrouteAudio(decoder, args),
      move: (args) => move(decoder, args, false),
      moveabs: (args) => move(decoder, args, true),
      debug: async () => {
        const result = await decoder.api.debug();
        return `debug toggled -> ${decoder.state.debug ? "ON" : "OFF"} (code ${result})`;
      },
      refresh: async () => {
        await decoder.api.fetchContext();
        await decoder.api.fetchRoutes();
        return "Refreshed.";
      },
      help: () => help,
    },
  });
};
