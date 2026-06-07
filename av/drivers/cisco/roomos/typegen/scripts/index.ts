import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { mergeEntries, uniqueKinds, uniqueProducts } from "./parse.ts";

import { renderSource } from "./render.ts";
import {
  buildCommandTree,
  buildFeedbackTree,
  buildGroupedTree,
  buildValueTree,
} from "./tree.ts";

import type {
  GeneratedModel,
  SchemaJson,
} from "./types.ts";

const FILE_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const FILE_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function generateSource(schema: SchemaJson): string {
  const entries = mergeEntries(schema.objects);
  const products = uniqueProducts(schema.objects);
  const kinds = uniqueKinds(schema.objects);
  const model: GeneratedModel = {
    entries,
    products,
    kinds,
    commandApi: buildGroupedTree(
      entries.filter((entry) => entry.type === "Command"),
      products,
      buildCommandTree,
    ),
    configurationState: buildGroupedTree(
      entries.filter((entry) => entry.type === "Configuration"),
      products,
      buildValueTree,
    ),
    statusState: buildGroupedTree(
      entries.filter((entry) => entry.type === "Status"),
      products,
      buildValueTree,
    ),
    feedbackState: buildGroupedTree(
      entries.filter(
        (entry) =>
          entry.type === "Event" ||
          entry.type === "Status" ||
          entry.type === "Configuration",
      ),
      products,
      buildFeedbackTree,
    ),
  };

  return renderSource(model);
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
