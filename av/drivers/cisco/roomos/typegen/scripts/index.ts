import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeEntry, sortStrings } from "./parse.ts";
import { renderSource } from "./render.ts";
import {
  buildCommandTree,
  buildFeedbackTree,
  buildGroupedTree,
  buildValueTree,
} from "./tree.ts";
import type { GeneratedModel, Tree, SchemaEntry, SchemaJson } from "./types.ts";

const FILE_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const FILE_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function generateSource(schema: SchemaJson): string {
  const entries = mergeEntries(schema.objects);
  const products = Array.from(
    new Set(entries.flatMap((entry) => entry.source.products)),
  ).sort();
  const kinds = ["Command", "Configuration", "Status", "Event"] as const;
  const model: GeneratedModel = {
    products,
    kinds,
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

  return renderSource(model);
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

    if (typeOrder !== 0) {
      return typeOrder;
    }

    const pathOrder = left.source.path.localeCompare(right.source.path);

    if (pathOrder !== 0) {
      return pathOrder;
    }

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

async function main(): Promise<void> {
  const raw = await fs.readFile(FILE_INPUT, "utf8");
  const schema: SchemaJson = JSON.parse(raw);
  const contents = generateSource(schema);

  await fs.mkdir(new URL(".", FILE_OUTPUT), { recursive: true });
  await fs.writeFile(FILE_OUTPUT, `${contents}\n`, "utf8");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
