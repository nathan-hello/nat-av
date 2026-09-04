import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../output");
const destination = resolve(here, "../../dist/output");

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
