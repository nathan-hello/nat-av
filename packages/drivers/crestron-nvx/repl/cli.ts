import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import NvxDriver from "../index.js";
import { createRepl } from "./index.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "self-signed": { type: "boolean", default: true },
      "verify-tls": { type: "boolean", default: false },
      port: { type: "string", default: "443" },
      help: { type: "boolean" },
    },
  });
  const usage = "repl <hostname-or-ip> [--port 443] [--verify-tls]";
  if (values.help) return console.log(usage);
  const [host] = positionals;
  const httpsPort = Number(values.port);
  if (
    positionals.length !== 1 ||
    !/^[\w.-]+$/.test(host) ||
    !Number.isInteger(httpsPort) ||
    httpsPort < 1 ||
    httpsPort > 65535
  )
    throw new Error(usage);
  const endpoint = {
    host,
    httpsPort,
    username: "",
    password: "",
    allowSelfSigned: !values["verify-tls"],
  };
  const driver = new NvxDriver("nvx", endpoint);
  try {
    await driver.login(async () => {
      console.log(`Reached ${driver.origin}.`);
      if (process.stdin.isTTY) {
        let hidden = false;
        const output = new Writable({
          write(chunk, _encoding, done) {
            if (!hidden) process.stdout.write(chunk);
            done();
          },
        });
        const rl = createInterface({
          input: process.stdin,
          output,
          terminal: true,
          historySize: 0,
        });
        const cancel = new AbortController();
        rl.once("close", () => cancel.abort());
        rl.once("SIGINT", () => rl.close());
        try {
          endpoint.username = await rl.question("Username: ", {
            signal: cancel.signal,
          });
          hidden = true;
          process.stdout.write("Password: ");
          endpoint.password = await rl.question("", { signal: cancel.signal });
        } finally {
          rl.close();
          if (hidden) process.stdout.write("\n");
        }
      } else {
        endpoint.username = process.env.NVX_USERNAME ?? "";
        endpoint.password = process.env.NVX_PASSWORD ?? "";
      }
      if (!endpoint.username || !endpoint.password)
        throw new Error(
          "Supply a username and password (NVX_USERNAME and NVX_PASSWORD for noninteractive input).",
        );
      return endpoint;
    });
    console.log("Authenticated. Type 'help' for commands.");
    await createRepl({ driver }).run();
  } finally {
    try {
      await driver.api.disconnect();
    } finally {
      driver.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
