import { Telemetry } from "@nat-av/core";
import * as http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import { router } from "@/router";
import { start } from "@/server/natav";

const port = 44100;
const host = "localhost";
const tel = new Telemetry("server");

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      tel.error("unknown error in router.fetch", { error });
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
);

const end = await start(server);

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});

tel.info(`Dante router UI at http://${host}:${port}`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  tel.info(`shutdown: got ${signal}`);
  server.close();
  await end();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
