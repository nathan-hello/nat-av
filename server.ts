import { start } from "@av/index";
import { Telemetry } from "@av/telemetry";
import { router } from "./app/router.ts";
import { serve } from "remix/node-serve";

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 44100;

const tel = new Telemetry("server");

const server = serve(
  async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      tel.error("unknown error in router.fetch", { error: error });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  {
    port,
  },
);

await start(server.app);

await server.ready;
tel.info(`http://localhost:${server.port}`);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
