import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type Valuespace =
  | string
  | {
      type?: string;
      Values?: readonly string[];
      multiple?: string | number | boolean;
      Min?: string | number;
      Max?: string | number;
      Step?: string | number;
      MinLength?: string | number;
      MaxLength?: string | number;
      [key: string]: unknown;
    };

type Param = {
  name: string;
  description?: string;
  required?: string | number | boolean;
  default?: JsonValue;
  valuespace: Valuespace;
  [key: string]: unknown;
};

type EventNode = {
  children?: Record<string, EventNode>;
  valuespace?: Valuespace;
  multiple?: string | number | boolean;
  required?: string | number | boolean;
  [key: string]: unknown;
};

type SchemaEntry = {
  id: number;
  path: string;
  normPath?: string;
  products: readonly string[];
  type: "Command" | "Configuration" | "Status" | "Event";
  attributes: {
    access?: string;
    backend?: string;
    description?: string;
    multiline?: string | number | boolean;
    params?: readonly Param[];
    privacyimpact?: string;
    read?: readonly unknown[];
    role?: readonly string[];
    state_dependent?: string;
    unavailableStates?: string;
    valuespace?: Valuespace;
    children?: Record<string, EventNode>;
    [key: string]: unknown;
  };
};

type SchemaJson = {
  objects: readonly SchemaEntry[];
};

type ReducedValuespace =
  | string
  | {
      type?: string;
      Values?: string[];
      multiple?: true;
    };

type ReducedParam = {
  name: string;
  required?: true;
  valuespace: ReducedValuespace;
};

type ReducedEventNode = {
  children?: Record<string, ReducedEventNode>;
  valuespace?: ReducedValuespace;
  multiple?: true;
  required?: true;
};

type ReducedEntry = {
  path: string;
  products: string[];
  type: SchemaEntry["type"];
  attributes: {
    params?: ReducedParam[];
    valuespace?: ReducedValuespace;
    children?: Record<string, ReducedEventNode>;
    multiline?: true;
  };
};

const DEFAULT_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const DEFAULT_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);


function indent(text: string, depth = 1): string {
  const prefix = "  ".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "True";
}

function hasMultiplicity(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== 0 &&
    value !== "0" &&
    value !== "False"
  );
}

function sortStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function normalizeValuespace(valuespace: Valuespace): ReducedValuespace {
  if (typeof valuespace === "string") {
    return valuespace;
  }

  const normalized: {
    type?: string;
    Values?: string[];
    multiple?: true;
  } = {};

  if (valuespace.type !== undefined) {
    normalized.type = valuespace.type;
  }

  if (valuespace.Values !== undefined) {
    normalized.Values = sortStrings(valuespace.Values);
  }

  if (hasMultiplicity(valuespace.multiple)) {
    normalized.multiple = true;
  }

  return normalized;
}

function normalizeParam(param: Param): ReducedParam {
  const normalized: ReducedParam = {
    name: param.name,
    valuespace: normalizeValuespace(param.valuespace),
  };

  if (isTruthyFlag(param.required)) {
    normalized.required = true;
  }

  return normalized;
}

function normalizeChildren(
  children: Record<string, EventNode>,
): Record<string, ReducedEventNode> {
  const normalized: Record<string, ReducedEventNode> = {};

  for (const [name, child] of Object.entries(children).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    normalized[name] = normalizeEventNode(child);
  }

  return normalized;
}

function normalizeEventNode(node: EventNode): ReducedEventNode {
  const normalized: ReducedEventNode = {};

  if (node.valuespace !== undefined) {
    normalized.valuespace = normalizeValuespace(node.valuespace);
  }

  if (hasMultiplicity(node.multiple)) {
    normalized.multiple = true;
  }

  if (isTruthyFlag(node.required)) {
    normalized.required = true;
  }

  if (node.children !== undefined) {
    normalized.children = normalizeChildren(node.children);
  }

  return normalized;
}

function normalizeEntry(entry: SchemaEntry): ReducedEntry {
  const attributes: ReducedEntry["attributes"] = {};

  switch (entry.type) {
    case "Command": {
      const params =
        entry.attributes.params?.map((param) => normalizeParam(param)) ?? [];
      params.sort((a, b) => a.name.localeCompare(b.name));
      attributes.params = params;

      if (hasMultiplicity(entry.attributes.multiline)) {
        attributes.multiline = true;
      }

      break;
    }
    case "Configuration":
    case "Status": {
      if (entry.attributes.valuespace === undefined) {
        throw new Error(`Missing valuespace for ${entry.type} ${entry.path}`);
      }

      attributes.valuespace = normalizeValuespace(entry.attributes.valuespace);
      break;
    }
    case "Event": {
      attributes.children = normalizeChildren(entry.attributes.children ?? {});
      break;
    }
  }

  return {
    path: entry.path,
    products: sortStrings(entry.products),
    type: entry.type,
    attributes,
  };
}

function mergeEntries(
  entries: readonly SchemaEntry[],
): readonly ReducedEntry[] {
  const groups = new Map<string, ReducedEntry>();

  for (const entry of entries) {
    const reduced = normalizeEntry(entry);
    const signature = JSON.stringify({
      path: reduced.path,
      type: reduced.type,
      attributes: reduced.attributes,
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

    return JSON.stringify(left.attributes).localeCompare(
      JSON.stringify(right.attributes),
    );
  });
}

function renderTuple(
  items: readonly string[],
  depth: number,
  multiline = false,
): string {
  if (!items.length) {
    return "readonly []";
  }

  if (!multiline) {
    return `readonly [${items.join(", ")}]`;
  }

  if (items.length === 1) {
    return `readonly [\n${indent(items[0], depth + 1)}\n${indent("]", depth)}`;
  }

  return `readonly [\n${items.map((item) => indent(`${item},`, depth + 1)).join("\n")}\n${indent("]", depth)}`;
}

function renderObject(fields: readonly string[], depth: number): string {
  if (!fields.length) {
    return "{}";
  }

  return `{\n${fields.map((field) => indent(field, depth + 1)).join("\n")}\n${indent("}", depth)}`;
}

function renderValuespace(value: ReducedValuespace, depth: number): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  const fields: string[] = [];

  if (value.type !== undefined) {
    fields.push(`type: ${JSON.stringify(value.type)};`);
  }

  if (value.Values !== undefined) {
    fields.push(
      `Values: ${renderTuple(
        value.Values.map((item) => JSON.stringify(item)),
        depth,
        false,
      )};`,
    );
  }

  if (value.multiple) {
    fields.push("multiple: true;");
  }

  return renderObject(fields, depth);
}

function renderParam(param: ReducedParam, depth: number): string {
  const fields = [`name: ${JSON.stringify(param.name)};`];

  if (param.required) {
    fields.push("required: true;");
  }

  fields.push(`valuespace: ${renderValuespace(param.valuespace, depth + 1)};`);
  return renderObject(fields, depth);
}

function renderEventNode(node: ReducedEventNode, depth: number): string {
  const fields: string[] = [];

  if (node.children !== undefined) {
    const children = Object.entries(node.children).map(
      ([name, child]) =>
        `${JSON.stringify(name)}: ${renderEventNode(child, depth + 1)};`,
    );
    fields.push(`children: ${renderObject(children, depth + 1)};`);
  }

  if (node.valuespace !== undefined) {
    fields.push(`valuespace: ${renderValuespace(node.valuespace, depth + 1)};`);
  }

  if (node.multiple) {
    fields.push("multiple: true;");
  }

  if (node.required) {
    fields.push("required: true;");
  }

  return renderObject(fields, depth);
}

function renderCommandAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  const fields = [
    `params: ${renderTuple(
      (attributes.params ?? []).map((param) => renderParam(param, depth + 1)),
      depth + 1,
      false,
    )};`,
  ];

  if (attributes.multiline) {
    fields.push("multiline: true;");
  }

  return renderObject(fields, depth);
}

function renderValueAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  if (attributes.valuespace === undefined) {
    throw new Error("Missing valuespace while rendering value attributes");
  }

  return renderObject(
    [`valuespace: ${renderValuespace(attributes.valuespace, depth + 1)};`],
    depth,
  );
}

function renderEventAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  return renderObject(
    [
      `children: ${renderObject(
        Object.entries(attributes.children ?? {}).map(
          ([name, child]) =>
            `${JSON.stringify(name)}: ${renderEventNode(child, depth + 2)};`,
        ),
        depth + 1,
      )};`,
    ],
    depth,
  );
}

function renderEntry(entry: ReducedEntry): string {
  let attributes = "{}";

  switch (entry.type) {
    case "Command":
      attributes = renderCommandAttributes(entry.attributes, 3);
      break;
    case "Configuration":
    case "Status":
      attributes = renderValueAttributes(entry.attributes, 3);
      break;
    case "Event":
      attributes = renderEventAttributes(entry.attributes, 3);
      break;
  }

  return `{
  path: ${JSON.stringify(entry.path)};
  products: ${renderTuple(
    entry.products.map((product) => JSON.stringify(product)),
    1,
    false,
  )};
  type: ${JSON.stringify(entry.type)};
  attributes: ${attributes};
}`;
}

function uniqueProducts(entries: readonly SchemaEntry[]): readonly string[] {
  return Array.from(new Set(entries.flatMap((entry) => entry.products))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function uniqueKinds(
  entries: readonly SchemaEntry[],
): readonly SchemaEntry["type"][] {
  const kinds: SchemaEntry["type"][] = [];

  for (const kind of new Set(entries.map((entry) => entry.type))) {
    kinds.push(kind);
  }

  return kinds.sort((a, b) => a.localeCompare(b));
}

function generateSource(schema: SchemaJson): string {
  const mergedEntries = mergeEntries(schema.objects);
  const products = uniqueProducts(schema.objects);
  const kinds = uniqueKinds(schema.objects);

  const union = mergedEntries.map((entry) => `  | ${renderEntry(entry)}`);

  return [
    `export type RoomOSSchema = { objects: readonly RoomOSObject[] };`,
    `export type RoomOSObject =\n${union.join("\n")};`,
    `export type RoomOSProduct = ${products.map((product) => JSON.stringify(product)).join(" | ")};`,
    `export type RoomOSKind = ${kinds.map((kind) => JSON.stringify(kind)).join(" | ")};`,
    `export type RoomOSProductTarget = RoomOSProduct | "any";`,
    `export type RoomOSRoot = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";`,
    `export type xCommandReturnDefault = null;`,
  ].join("\n\n");
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  function resolveUrl(value: string | undefined, fallback: URL): URL {
    if (value === undefined) {
      return fallback;
    }

    return pathToFileURL(resolve(process.cwd(), value));
  }
  const [inputArg, outputArg] = argv;
  const inputUrl = resolveUrl(inputArg, DEFAULT_INPUT);
  const outputUrl = resolveUrl(outputArg, DEFAULT_OUTPUT);

  const raw = await readFile(inputUrl, "utf8");
  const schema: SchemaJson = JSON.parse(raw);
  const contents = generateSource(schema);

  await mkdir(new URL(".", outputUrl), { recursive: true });
  await writeFile(outputUrl, `${contents}\n`, "utf8");
}

function isMainModule(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
