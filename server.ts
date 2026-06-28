import { router } from "@/router";
import { Telemetry } from "@av/index";
import { start } from "@server/index";
import * as http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";

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

await new Promise<void>((resolve) => {
  server.listen(port, resolve);
});

tel.info(`http://localhost:${port}`);

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.close();
  await end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
