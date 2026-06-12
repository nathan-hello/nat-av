import {
  groupEntriesByProductSet,
  removeBrackets,
} from "./parse.ts";

import type {
  EntryModel,
  EventNodeModel,
  Ancestry,
  SchemaEntry,
  Tree,
} from "./types.ts";

const EMPTY_SOURCE: SchemaEntry = {
  id: -1,
  path: "",
  products: [],
  type: "Command",
  attributes: {},
};

function createTree(source: SchemaEntry): Tree {
  return {
    isArray: false,
    isPath: false,
    source,
    params: [],
    valuespace: null,
    children: {},
  };
}

function getOrCreateChild(node: Tree, name: string, source: SchemaEntry): Tree {
  node.children[name] ??= createTree(source);
  const child = node.children[name];
  child.source = source;
  return child;
}

function mergeTree(target: Tree, source: Tree): void {
  if (typeof source.isArray === "number") {
    target.isArray = source.isArray;
  } else if (source.isArray) {
    target.isArray = true;
  }

  if (source.isPath) {
    target.isPath = true;
  }

  if (source.params.length > 0) {
    target.params = source.params;
  }

  if (source.valuespace !== null) {
    target.valuespace = source.valuespace;
  }

  for (const [name, child] of Object.entries(source.children ?? {})) {
    mergeTree(getOrCreateChild(target, name, child.source), child);
  }
}

function walkPath(root: Tree, path: string, source: SchemaEntry): Tree {
  let node = root;

  for (const segment of path.split(" ")) {
    const name = removeBrackets(segment);
    const child = getOrCreateChild(node, name, source);

    if (name !== segment) {
      child.isArray = true;
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

function buildCommandTree(entries: readonly EntryModel[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const node = walkPath(root, entry.path, entry.source);
    node.source = entry.source;
    node.isPath = true;
    node.params = entry.params ?? [];
  }

  return root;
}

function buildValueTree(entries: readonly EntryModel[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const rootNode = getOrCreateChild(root, entry.type, entry.source);
    const node = walkPath(rootNode, entry.path, entry.source);
    node.source = entry.source;
    node.isPath = true;

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
): Tree {
  const root = createTree(source);

  for (const [name, child] of Object.entries(children)) {
    const childPath = `${path} ${name}`;
    const node = createTree(sourceForPath(source, childPath));

    if (child.multiple) {
      node.isArray = true;
    }

    node.isPath =
      child.valuespace !== undefined ||
      child.multiple !== undefined ||
      child.required !== undefined ||
      child.children === undefined;

    if (child.valuespace !== undefined) {
      node.valuespace = child.valuespace;
    }

    if (child.children !== undefined) {
      node.children = buildEventSubtree(child.children, source, childPath).children;
    }

    root.children[name] = node;
  }

  return root;
}

function buildFeedbackTree(entries: readonly EntryModel[]): Tree {
  const root = createTree(entries[0]?.source ?? EMPTY_SOURCE);

  for (const entry of entries) {
    const rootNode = getOrCreateChild(root, entry.type, entry.source);
    const node = walkPath(rootNode, entry.path, entry.source);
    node.source = entry.source;
    node.isPath = true;

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
  buildTree: (entries: readonly EntryModel[]) => Tree,
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

export { buildCommandTree, buildFeedbackTree, buildGroupedTree, buildValueTree };
