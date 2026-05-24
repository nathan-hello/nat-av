import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT = new URL("../schemas/11.33.1 October 2025.json", import.meta.url);
const DEFAULT_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function isMainModule(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

function resolveUrl(value: string | undefined, fallback: URL): URL {
  if (value === undefined) {
    return fallback;
  }

  return pathToFileURL(resolve(process.cwd(), value));
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const [inputArg, outputArg] = argv;
  const inputUrl = resolveUrl(inputArg, DEFAULT_INPUT);
  const outputUrl = resolveUrl(outputArg, DEFAULT_OUTPUT);

  const raw = await readFile(inputUrl, "utf8");
  const schema = JSON.parse(raw);
  const contents = `const obj = ${JSON.stringify(schema, null, 2)} as const;\n\nexport default obj;\n`;

  await mkdir(new URL(".", outputUrl), { recursive: true });
  await writeFile(outputUrl, contents, "utf8");
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
