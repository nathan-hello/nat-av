import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  groupEntriesByProductSet,
  isLiteralWithoutValues,
  mergeEntries,
  removeBrackets,
  uniqueKinds,
  uniqueProducts,
} from "./parse.ts";

import { renderSource } from "./render.ts";

import type {
  EntryModel,
  EventNodeModel,
  GeneratedModel,
  GroupedTreeModel,
  SchemaJson,
  TypeTreeNode,
} from "./types.ts";

const FILE_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const FILE_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function getOrCreateChild(node: TypeTreeNode, name: string): TypeTreeNode {
  node.children ??= {};
  node.children[name] ??= {};
  return node.children[name];
}

function mergeTree(target: TypeTreeNode, source: TypeTreeNode): void {
  if (source.array) {
    target.array = true;
  }

  if (source.source !== undefined) {
    target.source = source.source;
  }

  if (source.missingTypePath !== undefined) {
    target.missingTypePath = source.missingTypePath;
  }

  if (source.callable !== undefined) {
    target.callable = source.callable;
  }

  if (source.valuespace !== undefined) {
    target.valuespace = source.valuespace;
  }

  for (const [name, child] of Object.entries(source.children ?? {})) {
    mergeTree(getOrCreateChild(target, name), child);
  }
}

function walkPath(root: TypeTreeNode, path: string): TypeTreeNode {
  let node = root;

  for (const segment of path.split(" ")) {
    const name = removeBrackets(segment);
    const child = getOrCreateChild(node, name);

    if (name !== segment) {
      child.array = true;
    }

    node = child;
  }

  return node;
}

function buildCommandTree(entries: readonly EntryModel[]): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const entry of entries) {
    const node = walkPath(root, entry.path);
    node.source = entry.source;
    node.callable = {
      params: entry.params ?? [],
      ...(entry.multiline ? { multiline: true } : {}),
    };
  }

  return root;
}

function buildValueTree(entries: readonly EntryModel[]): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const entry of entries) {
    const node = walkPath(root, entry.path);
    node.source = entry.source;

    if (entry.valuespace === undefined) {
      throw new Error(`Missing valuespace for ${entry.type} ${entry.path}`);
    }

    node.valuespace = entry.valuespace;
  }

  return root;
}

function buildEventSubtree(
  children: Record<string, EventNodeModel>,
  path: string,
): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const [name, child] of Object.entries(children)) {
    const childPath = `${path} ${name}`;
    const node: TypeTreeNode = {};

    if (child.multiple) {
      node.array = true;
    }

    if (child.valuespace !== undefined) {
      node.valuespace = child.valuespace;

      if (isLiteralWithoutValues(child.valuespace)) {
        node.missingTypePath = childPath;
      }
    }

    if (child.children !== undefined) {
      node.children = buildEventSubtree(child.children, childPath).children;
    }

    root.children ??= {};
    root.children[name] = node;
  }

  return root;
}

function buildFeedbackTree(entries: readonly EntryModel[]): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const entry of entries) {
    const node = walkPath(root, entry.path);
    node.source = entry.source;
    mergeTree(node, buildEventSubtree(entry.children ?? {}, entry.path));
  }

  return root;
}

function buildGroupedTree(
  entries: readonly EntryModel[],
  allProducts: readonly string[],
  buildTree: (entries: readonly EntryModel[]) => TypeTreeNode,
): GroupedTreeModel {
  const { common, sets } = groupEntriesByProductSet(entries, allProducts);

  return {
    common: buildTree(common),
    sets: sets.map((set) => ({
      products: set.products,
      tree: buildTree(set.entries),
    })),
  };
}

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
