import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEntry, sortStrings } from "./parse.js";
import { render } from "./render.js";
import {
  buildCommandTree,
  buildFeedbackTree,
  buildGroupedTree,
  buildValueTree,
} from "./tree.js";
import type { GeneratedModel, SchemaEntry, SchemaJson, Tree } from "./types.js";

const DEFAULT_INPUT = new URL("../assets/schemas", import.meta.url);
const DEFAULT_OUTPUT = new URL("../generated.ts", import.meta.url);

function modelFromEntries(entries: readonly Tree[]): GeneratedModel {
  const products = Array.from(
    new Set(entries.flatMap((entry) => entry.source.products)),
  ).sort();
  const kinds = ["Command", "Configuration", "Status", "Event"] as const;

  return {
    products,
    kinds,
    eventEntries: entries.filter((entry) => entry.source.type === "Event"),
    commandApi: buildGroupedTree(
      entries.filter((entry) => entry.source.type === "Command"),
      products,
      buildCommandTree,
    ),
    configuration: buildGroupedTree(
      entries.filter((entry) => entry.source.type === "Configuration"),
      products,
      buildValueTree,
    ),
    status: buildGroupedTree(
      entries.filter((entry) => entry.source.type === "Status"),
      products,
      buildValueTree,
    ),
    event: buildGroupedTree(
      entries.filter((entry) => entry.source.type === "Event"),
      products,
      buildFeedbackTree,
    ),
  };
}

function generateSource(schema: SchemaJson): string {
  return generateModel(schema).source;
}

function generateModel(schema: SchemaJson): {
  entries: readonly Tree[];
  source: string;
} {
  const entries = mergeEntries(schema.objects);
  return { entries, source: render(modelFromEntries(entries)) };
}

function mergeEntries(entries: readonly SchemaEntry[]): readonly Tree[] {
  const groups = new Map<string, Tree>();

  for (const entry of entries) {
    const reduced = normalizeEntry(entry);
    const signature = JSON.stringify({
      path: reduced.source.path,
      type: reduced.source.type,
      params: reduced.params,
      valuespace: reduced.valuespace,
      children: reduced.children,
    });

    const existing = groups.get(signature);

    if (existing !== undefined) {
      existing.source = {
        ...existing.source,
        products: sortStrings([
          ...existing.source.products,
          ...reduced.source.products,
        ]),
      };
      continue;
    }

    groups.set(signature, reduced);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const typeOrder = left.source.type.localeCompare(right.source.type);
    if (typeOrder !== 0) return typeOrder;

    const pathOrder = left.source.path.localeCompare(right.source.path);
    if (pathOrder !== 0) return pathOrder;

    return JSON.stringify({
      params: left.params,
      valuespace: left.valuespace,
      children: left.children,
    }).localeCompare(
      JSON.stringify({
        params: right.params,
        valuespace: right.valuespace,
        children: right.children,
      }),
    );
  });
}

function entrySignature(entry: Tree): string {
  return JSON.stringify({
    path: entry.source.path,
    type: entry.source.type,
    params: entry.params,
    valuespace: entry.valuespace,
    children: entry.children,
  });
}

function commonEntries(models: readonly (readonly Tree[])[]): readonly Tree[] {
  const [first, ...rest] = models;
  if (first === undefined) return [];

  const matches = rest.map(
    (entries) =>
      new Map(entries.map((entry) => [entrySignature(entry), entry])),
  );

  return first.flatMap((entry) => {
    const signature = entrySignature(entry);
    const matchingEntries = matches.map((bySignature) =>
      bySignature.get(signature),
    );

    if (matchingEntries.some((matching) => matching === undefined)) {
      return [];
    }

    const products = matchingEntries.reduce<readonly string[]>(
      (common, matching) =>
        common.filter((product) => matching!.source.products.includes(product)),
      entry.source.products,
    );

    return [
      {
        ...entry,
        source: {
          ...entry.source,
          products,
        },
      },
    ];
  });
}

function versionFromFile(file: string): string {
  return decodeURIComponent(path.basename(file, path.extname(file)));
}

async function readJson(file: URL | string): Promise<SchemaJson> {
  const raw = await fs.readFile(file, "utf8");
  // TSAS: JSON.parse is checked by the generated schema renderer before use.
  return JSON.parse(raw) as SchemaJson;
}

async function jsonFiles(inputDir: URL | string): Promise<string[]> {
  const directory = typeof inputDir === "string" ? inputDir : inputDir.pathname;
  const files = await fs.readdir(directory);
  return files
    .filter((file) => file.endsWith(".json") && file !== "schemas.json")
    .sort((left, right) => left.localeCompare(right))
    .map((file) => path.join(directory, file));
}

export async function run({
  input = DEFAULT_INPUT,
  output = DEFAULT_OUTPUT,
}: {
  input?: URL | string;
  output?: URL | string;
} = {}): Promise<void> {
  const outputFile = output;
  const files =
    typeof input === "string" && (await fs.stat(input)).isDirectory() ?
      await jsonFiles(input)
    : input instanceof URL && (await fs.stat(input)).isDirectory() ?
      await jsonFiles(input)
    : [input];

  const schemas = await Promise.all(files.map((file) => readJson(file)));
  const models = schemas.map((schema) => generateModel(schema));
  const versions = files.map((file) =>
    versionFromFile(typeof file === "string" ? file : file.pathname),
  );
  const allEntries = models.map((model) => model.entries);
  const common = modelFromEntries(commonEntries(allEntries));

  const rendered = [
    render(common, "any", "GeneratedRoomOSCommon"),
    ...versions.map((version, index) =>
      render(
        modelFromEntries(models[index]!.entries),
        version,
        `GeneratedRoomOS_${index}`,
      ),
    ),
    "export type GeneratedRoomOS = {",
    "  any: GeneratedRoomOSCommon.RoomOSSchema;",
    ...versions.map(
      (version, index) =>
        `  ${JSON.stringify(version)}: GeneratedRoomOS_${index}.RoomOSSchema;`,
    ),
    "};",
    "",
  ].join("\n\n");

  const outputPath =
    outputFile instanceof URL ? outputFile.pathname : outputFile;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${rendered}\n`, "utf8");
}

function main(): Promise<void> {
  const options: { input?: string; output?: string } = {};

  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    const value = process.argv[index + 1];

    if ((argument === "--input" || argument === "--input-dir") && value) {
      options.input = value;
      index += 1;
      continue;
    }

    if (argument === "--output" && value) {
      options.output = value;
      index += 1;
    }
  }

  return run(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}

export { generateSource };
