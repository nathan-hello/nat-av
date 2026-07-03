import { Tcp } from "@av/index";
import * as readline from "node:readline";
import config from "../config.ts";
import Decoder from "../index.ts";

const DECODER_ADDR = process.argv[2] ?? "decoder-0c7a1566cf92.local";
const DECODER_PORT = Number(process.argv[3] ?? 12345);

const socket = new Tcp({
  addr: DECODER_ADDR,
  port: DECODER_PORT,
  keepAliveMs: 10000,
});

const decoder = new Decoder({ name: "decoder", socket });

const encoders = config.encoders;

function parseArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === inQuote) {
        inQuote = null;
      } else {
        current += c;
      }
    } else if (c === '"' || c === "'") {
      inQuote = c;
    } else if (/\s/.test(c)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += c;
    }
  }
  if (current.length > 0) args.push(current);
  return args;
}

function resolveEncoder(query: string) {
  const byName = encoders.find(
    (e) => e.name.toLowerCase() === query.toLowerCase(),
  );
  if (byName) return byName;
  const partial = encoders.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous: "${query}" matches ${partial.map((e) => e.name).join(", ")}`,
    );
  }
  return null;
}

function cmdEncoders() {
  for (const [i, e] of encoders.entries()) {
    console.log(`${i}: ${e.name}`);
    console.log(`    ${e.uri}`);
  }
}

function cmdContext() {
  const ctx = decoder.state.context;
  if (!ctx) {
    console.log("(no context — try 'refresh')");
    return;
  }
  console.log("Video outputs:");
  for (const v of ctx.video) {
    console.log(`  [${v.output}] ${v.type} ${v.width}x${v.height}`);
  }
  console.log("Audio outputs:");
  for (const a of ctx.audio) {
    console.log(`  [${a.output}] ${a.type}`);
  }
}

function cmdRoutes() {
  const { routes } = decoder.state;
  const videos = routes.video.flat().filter(Boolean);
  if (videos.length === 0 && routes.audio.length === 0) {
    console.log("(no routes)");
    return;
  }
  for (const v of videos) {
    console.log(
      `video [${v.output}:${v.window}] ${v.uri}  (${v.x},${v.y} ${v.width}x${v.height} z=${v.z})`,
    );
  }
  for (const a of routes.audio.filter(Boolean)) {
    console.log(`audio [${a.output}:${a.window}] ${a.uri}`);
  }
}

async function cmdRoute(args: string[]) {
  if (args.length < 1) {
    console.log("Usage: route <encoder> [output] [window] [z]");
    return;
  }
  const enc = resolveEncoder(args[0]);
  if (!enc) throw new Error(`Encoder not found: ${args[0]}`);
  const output = args[1] !== undefined ? Number(args[1]) : 0;
  const window = args[2] !== undefined ? Number(args[2]) : 0;
  const z = args[3] !== undefined ? Number(args[3]) : undefined;
  if (isNaN(output)) throw new Error(`Invalid output: ${args[1]}`);
  if (isNaN(window)) throw new Error(`Invalid window: ${args[2]}`);
  if (z !== undefined && isNaN(z)) throw new Error(`Invalid z: ${args[3]}`);
  const video: Record<string, unknown> = { output, window, uri: enc.uri };
  if (z !== undefined) video.z = z;
  // TSAS: api.route fills x/y/z/width/height from output defaults when omitted
  await decoder.api.route({ video: video as never });
  console.log(`Routed video [${output}:${window}] ← ${enc.name}${z !== undefined ? ` (z=${z})` : ""}`);
  cmdRoutes();
}

async function cmdAudio(args: string[]) {
  if (args.length < 2) {
    console.log("Usage: audio <encoder> <output>");
    return;
  }
  const enc = resolveEncoder(args[0]);
  if (!enc) throw new Error(`Encoder not found: ${args[0]}`);
  const output = Number(args[1]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[1]}`);
  await decoder.api.route({ audio: { output, window: 0, uri: enc.uri } });
  console.log(`Routed audio [${output}] ← ${enc.name}`);
  cmdRoutes();
}

async function cmdUnroute(args: string[]) {
  if (args.length === 1 && args[0] === "all") {
    await decoder.api.unroute("all");
    console.log("Unrouted all");
    cmdRoutes();
    return;
  }
  if (args.length < 2) {
    console.log("Usage: unroute <output> <window>  |  unroute all");
    return;
  }
  const output = Number(args[0]);
  const window = Number(args[1]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[0]}`);
  if (isNaN(window)) throw new Error(`Invalid window: ${args[1]}`);
  await decoder.api.unroute({
    video: [{ output, window }],
    audio: [],
  });
  console.log(`Unrouted video [${output}:${window}]`);
  cmdRoutes();
}

async function cmdUnrouteAudio(args: string[]) {
  if (args.length < 1) {
    console.log("Usage: unroute-audio <output>");
    return;
  }
  const output = Number(args[0]);
  if (isNaN(output)) throw new Error(`Invalid output: ${args[0]}`);
  await decoder.api.unroute({
    video: [],
    audio: [{ output }],
  });
  console.log(`Unrouted audio [${output}]`);
  cmdRoutes();
}

async function cmdMove(args: string[], absolute: boolean) {
  if (args.length < 4) {
    console.log(
      `Usage: ${absolute ? "moveAbs" : "move"} <output> <window> <${absolute ? "x" : "dx"}> <${absolute ? "y" : "dy"}> [${absolute ? "w" : "dw"}] [${absolute ? "h" : "dh"}] [z]`,
    );
    return;
  }
  const v = {
    output: Number(args[0]),
    window: Number(args[1]),
    x: Number(args[2]),
    y: Number(args[3]),
    width: args[4] !== undefined ? Number(args[4]) : undefined,
    height: args[5] !== undefined ? Number(args[5]) : undefined,
    z: args[6] !== undefined ? Number(args[6]) : undefined,
  };
  if (isNaN(v.output)) throw new Error(`Invalid output: ${args[0]}`);
  if (isNaN(v.window)) throw new Error(`Invalid window: ${args[1]}`);
  if (v.z !== undefined && isNaN(v.z)) throw new Error(`Invalid z: ${args[6]}`);
  const fn = absolute ? decoder.api.moveAbsolute : decoder.api.moveRelative;
  await fn(v);
  console.log(`${absolute ? "Moved (abs)" : "Moved (rel)"} [${v.output}:${v.window}]${v.z !== undefined ? ` (z=${v.z})` : ""}`);
  cmdRoutes();
}

async function cmdRefresh() {
  process.stdout.write("Refreshing... ");
  await decoder.api.fetchContext();
  await decoder.api.fetchRoutes();
  console.log("done.");
}

async function cmdDebug() {
  const result = await decoder.api.debug();
  console.log(`debug toggled -> ${decoder.state.debug ? "ON" : "OFF"} (code ${result})`);
}

function cmdHelp() {
  console.log(`Commands:
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
  exit | quit         Exit`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "decoder> ",
});

console.log(`Connecting to decoder at ${DECODER_ADDR}:${DECODER_PORT}...`);

await socket.start();

const connected = new Promise<void>((resolve) => {
  socket.on("connected", () => resolve());
});

await Promise.race([
  connected,
  new Promise<void>((resolve) => setTimeout(() => resolve(), 5000)),
]);

if (decoder.state.context) {
  console.log("Connected. Context loaded.");
} else {
  console.log("Connected (context not yet fetched — try 'refresh').");
}

rl.prompt();

rl.on("line", async (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [cmd, ...args] = parseArgs(trimmed);
  const command = cmd.toLowerCase();

  try {
    switch (command) {
      case "list":
      case "encoders":
        cmdEncoders();
        break;
      case "context":
        cmdContext();
        break;
      case "routes":
        cmdRoutes();
        break;
      case "route":
        await cmdRoute(args);
        break;
      case "audio":
        await cmdAudio(args);
        break;
      case "unroute":
        await cmdUnroute(args);
        break;
      case "unroute-audio":
        await cmdUnrouteAudio(args);
        break;
      case "move":
        await cmdMove(args, false);
        break;
      case "moveabs":
        await cmdMove(args, true);
        break;
      case "debug":
        await cmdDebug();
        break;
      case "refresh":
        await cmdRefresh();
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
  void socket.end();
  process.exit(0);
});
