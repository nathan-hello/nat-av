import { groupEntriesByProductSet, removeBrackets } from "./parse.ts";

import type { Ancestry, SchemaEntry, Tree } from "./types.ts";

const EMPTY_SOURCE: SchemaEntry = {
  id: -1,
  path: "",
  products: [],
  type: "Command",
  attributes: {},
};

function createTree(source: SchemaEntry): Tree {
  return {
    array: false,
    isPath: false,
    source,
    params: [],
    valuespace: null,
    children: {},
  };
}

function sourceForPath(source: SchemaEntry, path: string): SchemaEntry {
  return {
    ...source,
    path,
    normPath: path,
  };
}

function getOrCreateChild(node: Tree, name: string, source: SchemaEntry): Tree {
  node.children[name] ??= createTree(source);
  const child = node.children[name];
  child.source = source;
  return child;
}

function mergeTree(target: Tree, source: Tree): void {
  if (typeof source.array === "number") {
    target.array = source.array;
  } else if (source.array) {
    target.array = true;
  }

  target.isPath ||= source.isPath;

  if (source.params.length > 0) {
    target.params = source.params;
  }

  if (source.valuespace !== null) {
    target.valuespace = source.valuespace;
  }

  for (const [name, child] of Object.entries(source.children)) {
    mergeTree(getOrCreateChild(target, name, child.source), child);
  }
}

function walkPath(root: Tree, path: string, source: SchemaEntry): Tree {
  let node = root;
  let currentPath = "";

  for (const segment of path.split(" ")) {
    currentPath = currentPath ? `${currentPath} ${segment}` : segment;
    const name = removeBrackets(segment);
    const child = getOrCreateChild(
      node,
      name,
      sourceForPath(source, currentPath),
    );

    if (name !== segment) {
      child.array = true;
    }

    node = child;
  }

  return node;
}

function buildCommandTree(entries: readonly Tree[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const node = walkPath(root, entry.source.path, entry.source);
    node.source = entry.source;
    node.isPath = true;
    node.params = entry.params;
    node.valuespace = entry.valuespace;
  }

  return root;
}

function buildValueTree(entries: readonly Tree[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const rootNode = getOrCreateChild(root, entry.source.type, entry.source);
    const node = walkPath(rootNode, entry.source.path, entry.source);
    node.source = entry.source;
    node.isPath = true;
    node.valuespace = entry.valuespace;
  }

  return root;
}

function buildEventSubtree(
  children: Record<string, Tree>,
  source: SchemaEntry,
  path: string,
): Tree {
  const root = createTree(source);

  for (const [name, child] of Object.entries(children)) {
    const childPath = `${path} ${name}`;
    const node = createTree(sourceForPath(source, childPath));

    node.array = child.array;
    node.isPath =
      child.isPath || child.valuespace !== null || child.children !== undefined;
    node.valuespace = child.valuespace;
    node.params = child.params;

    if (Object.keys(child.children).length > 0) {
      node.children = buildEventSubtree(
        child.children,
        source,
        childPath,
      ).children;
    }

    root.children[name] = node;
  }

  return root;
}

function buildFeedbackTree(entries: readonly Tree[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const rootNode = getOrCreateChild(root, entry.source.type, entry.source);
    const node = walkPath(rootNode, entry.source.path, entry.source);
    node.source = entry.source;
    node.isPath = true;

    if (entry.source.type === "Event") {
      mergeTree(
        node,
        buildEventSubtree(entry.children, entry.source, entry.source.path),
      );
      continue;
    }

    node.valuespace = entry.valuespace;
  }

  return root;
}

function buildGroupedTree(
  entries: readonly Tree[],
  allProducts: readonly string[],
  buildTree: (entries: readonly Tree[]) => Tree,
): Ancestry {
  const { common, sets } = groupEntriesByProductSet(entries, allProducts);

  return {
    common: buildTree(common),
    sets: sets.map((set) => ({
      products: set.products,
      tree: buildTree(set.entries),
    })),
  };
}

export {
  buildCommandTree,
  buildFeedbackTree,
  buildGroupedTree,
  buildValueTree,
};
