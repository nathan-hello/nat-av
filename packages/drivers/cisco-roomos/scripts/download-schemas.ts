import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SCHEMA_API = "https://roomos.cisco.com/api/schema/";
const outputDirectory = path.resolve(process.cwd(), "assets/schemas");

type SchemaManifestEntry = {
  name: string;
};

async function writeIfChanged(file: string, contents: string): Promise<void> {
  try {
    if ((await fs.readFile(file, "utf8")) === contents) {
      return;
    }
  } catch {
    // The file does not exist yet.
  }

  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, contents, "utf8");
  await fs.rename(temporary, file);
}

export async function run(manifestFile: string): Promise<void> {
  if (!manifestFile) {
    throw new Error("usage: download-schemas.ts <schemas.json>");
  }

  const manifestContents = await fs.readFile(manifestFile, "utf8");
  // TSAS: The manifest is validated below before its names are used as paths.
  const manifest = JSON.parse(manifestContents) as SchemaManifestEntry[];

  if (
    !Array.isArray(manifest) ||
    manifest.some((entry) => typeof entry.name !== "string")
  ) {
    throw new Error(`Invalid schema manifest: ${manifestFile}`);
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  await writeIfChanged(
    path.join(outputDirectory, "schemas.json"),
    manifestContents,
  );

  const failures: string[] = [];
  for (const { name } of manifest) {
    const response = await fetch(`${SCHEMA_API}${encodeURIComponent(name)}`);
    if (!response.ok) {
      failures.push(`${name}: ${response.status} ${response.statusText}`);
      continue;
    }

    const contents = `${JSON.stringify(await response.json(), null, 2)}\n`;
    await writeIfChanged(path.join(outputDirectory, `${name}.json`), contents);
    console.log(`downloaded ${name}`);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to download schemas:\n${failures.join("\n")}`);
  }
}

async function main(): Promise<void> {
  const manifestFile =
    process.argv[2] === "--" ? process.argv[3] : process.argv[2];
  if (!manifestFile) {
    throw new Error("usage: download-schemas.ts <schemas.json>");
  }

  await run(manifestFile);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
