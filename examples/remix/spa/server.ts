import { router } from "@/router";
import { Telemetry } from "@nat-av/core";
import { start } from "@/server/index";
import * as http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import type { ProcessEventMap } from "node:process";

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 44100;

const tel = new Telemetry("server");

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      tel.error("unknown error in router.fetch", { error: error });
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
);

const end = await start(server);

tel.info("starting node:http server...");

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "localhost", resolve);
});

tel.info(`node:http server listening on localhost:${port}`);

let shuttingDown = false;

async function shutdown(event: keyof ProcessEventMap) {
  if (shuttingDown) {
    tel.warn(
      `shutdown: got event ${event}. ignored because process is already shutting down.`,
    );
    return;
  }
  shuttingDown = true;

  tel.info(`shutdown: got event ${event}. shutting down.`);

  const success = await tel.task(
    `shutdown: got event ${event}. shutting down.`,
    async () => {
      server.close();
      await end();
    },
  );

  if (!success.ok) {
    tel.error("shutdown: got error. exiting.", { error: success.error });
  }
  process.exit(0);
}

process.on;
process.on("SIGINT", (e) => shutdown(e));
process.on("SIGTERM", (e) => shutdown(e));
