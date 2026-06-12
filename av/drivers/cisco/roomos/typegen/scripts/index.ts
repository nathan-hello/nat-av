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

import type {
  EntryModel,
  GeneratedModel,
  SchemaEntry,
  SchemaJson,
} from "./types.ts";

const FILE_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const FILE_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function generateSource(schema: SchemaJson): string {
  const entries = mergeEntries(schema.objects);
  const products = Array.from(
    new Set(entries.flatMap((entry) => entry.products)),
  ).sort();
  const kinds = ["Command", "Configuration", "Status", "Event"] as const;
  const model: GeneratedModel = {
    entries,
    products,
    kinds,
    commandApi: buildGroupedTree(
      entries.filter((entry) => entry.type === "Command"),
      products,
      buildCommandTree,
    ),
    configuration: buildGroupedTree(
      entries.filter((entry) => entry.type === "Configuration"),
      products,
      buildValueTree,
    ),
    status: buildGroupedTree(
      entries.filter((entry) => entry.type === "Status"),
      products,
      buildValueTree,
    ),
    event: buildGroupedTree(
      entries.filter((entry) => entry.type === "Event"),
      products,
      buildFeedbackTree,
    ),
  };

  return renderSource(model);
}

function mergeEntries(entries: readonly SchemaEntry[]): readonly EntryModel[] {
  const groups = new Map<string, EntryModel>();

  for (const entry of entries) {
    const reduced = normalizeEntry(entry);
    const signature = JSON.stringify({
      path: reduced.path,
      type: reduced.type,
      params: reduced.params,
      valuespace: reduced.valuespace,
      children: reduced.children,
      multiline: reduced.multiline,
    });

    const existing = groups.get(signature);

    if (existing !== undefined) {
      existing.products = sortStrings([
        ...existing.products,
        ...reduced.products,
      ]);
      continue;
    }

    groups.set(signature, reduced);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const typeOrder = left.type.localeCompare(right.type);

    if (typeOrder !== 0) {
      return typeOrder;
    }

    const pathOrder = left.path.localeCompare(right.path);

    if (pathOrder !== 0) {
      return pathOrder;
    }

    return JSON.stringify({
      params: left.params,
      valuespace: left.valuespace,
      children: left.children,
      multiline: left.multiline,
    }).localeCompare(
      JSON.stringify({
        params: right.params,
        valuespace: right.valuespace,
        children: right.children,
        multiline: right.multiline,
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
