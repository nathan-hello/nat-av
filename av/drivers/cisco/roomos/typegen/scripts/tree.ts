import {
  groupEntriesByProductSet,
  isLiteralWithoutValues,
  removeBrackets,
} from "./parse.ts";

import type {
  EntryModel,
  EventNodeModel,
  GroupedTreeModel,
  SchemaEntry,
  TypeTreeNode,
} from "./types.ts";

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

function sourceForPath(source: SchemaEntry, path: string): SchemaEntry {
  return {
    ...source,
    path,
    normPath: path,
  };
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
    const rootNode = getOrCreateChild(root, entry.type);
    const node = walkPath(rootNode, entry.path);
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
  source: SchemaEntry,
  path: string,
): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const [name, child] of Object.entries(children)) {
    const childPath = `${path} ${name}`;
    const node: TypeTreeNode = {};

    node.source = sourceForPath(source, childPath);

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
      node.children = buildEventSubtree(child.children, source, childPath).children;
    }

    root.children ??= {};
    root.children[name] = node;
  }

  return root;
}

function buildFeedbackTree(entries: readonly EntryModel[]): TypeTreeNode {
  const root: TypeTreeNode = {};

  for (const entry of entries) {
    const rootNode = getOrCreateChild(root, entry.type);
    const node = walkPath(rootNode, entry.path);
    node.source = entry.source;

    if (entry.type === "Event") {
      mergeTree(node, buildEventSubtree(entry.children ?? {}, entry.source, entry.path));
      continue;
    }

    if (entry.valuespace === undefined) {
      throw new Error(`Missing valuespace for ${entry.type} ${entry.path}`);
    }

    node.valuespace = entry.valuespace;
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

export { buildCommandTree, buildFeedbackTree, buildGroupedTree, buildValueTree };
