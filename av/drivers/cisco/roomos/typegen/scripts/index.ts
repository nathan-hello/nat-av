import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type Valuespace =
  | string
  | {
      type?: string;
      Values?: readonly string[];
      values?: readonly string[];
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
  values?: readonly string[];
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
  source: SchemaEntry;
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

type CommandTreeNode = {
  array: boolean;
  children: Map<string, CommandTreeNode>;
  entry?: ReducedEntry;
};

const DEFAULT_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const DEFAULT_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

function isMainModule(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

function resolveUrl(value: string | undefined, fallback: URL): URL {
  if (value === undefined) {
    return fallback;
  }

  return pathToFileURL(resolve(process.cwd(), value));
}

function indent(text: string, depth = 1): string {
  const prefix = "  ".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

function escapeComment(value: string): string {
  return value.replaceAll("*/", "* /");
}

function emitDoc(lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `/**\n${lines.map((line) => ` * ${escapeComment(line)}`).join("\n")}\n */\n`;
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

function stripIndex(segment: string): string {
  return segment.replace(/\[[^\]]*\]/g, "");
}

function safeAliasSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_");
}

function sortStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function literalValues(valuespace: Valuespace): readonly string[] | undefined {
  if (typeof valuespace === "string") {
    return undefined;
  }

  return valuespace.Values ?? valuespace.values;
}

function baseValueType(valuespace: Valuespace): string {
  if (typeof valuespace === "string") {
    switch (valuespace) {
      case "Integer":
      case "int":
        return "number";
      case "String":
      case "string":
        return "string";
      case "literal":
        return "unknown";
      default:
        return "unknown";
    }
  }

  switch (valuespace.type) {
    case "Integer":
      return "number";
    case "String":
      return "string";
    case "Boolean":
      return "boolean";
    case "Literal":
      return literalValues(valuespace)?.length
        ? literalValues(valuespace)!.map((value) => JSON.stringify(value)).join(" | ")
        : "unknown";
    case "IntegerArray":
      return "number";
    case "StringArray":
      return "string";
    case "LiteralArray":
      return literalValues(valuespace)?.length
        ? literalValues(valuespace)!.map((value) => JSON.stringify(value)).join(" | ")
        : "unknown";
    case "literal":
      return literalValues(valuespace)?.length
        ? literalValues(valuespace)!.map((value) => JSON.stringify(value)).join(" | ")
        : "unknown";
    case "int":
      return "number";
    case "string":
      return "string";
    default:
      return "unknown";
  }
}

function valueType(valuespace: Valuespace | undefined): string {
  if (valuespace === undefined) {
    return "unknown";
  }

  const isArrayType =
    typeof valuespace === "string"
      ? false
      : /Array$/.test(valuespace.type ?? "") || hasMultiplicity(valuespace.multiple);
  const base = baseValueType(valuespace);
  return isArrayType ? `Array<${base}>` : base;
}

function formatEntryDoc(entry: SchemaEntry): string {
  const docs: string[] = [
    `Path: ${JSON.stringify(entry.path)}`,
    `Type: ${entry.type}`,
  ];

  if (entry.normPath !== undefined) {
    docs.push(`NormPath: ${JSON.stringify(entry.normPath)}`);
  }

  if (entry.attributes.description) {
    docs.push(`Description: ${entry.attributes.description}`);
  }

  if (entry.attributes.access) {
    docs.push(`Access: ${entry.attributes.access}`);
  }

  if (entry.attributes.backend) {
    docs.push(`Backend: ${entry.attributes.backend}`);
  }

  if (entry.attributes.role?.length) {
    docs.push(`Roles: ${JSON.stringify(entry.attributes.role)}`);
  }

  if (entry.attributes.privacyimpact) {
    docs.push(`Privacyimpact: ${entry.attributes.privacyimpact}`);
  }

  if (entry.attributes.state_dependent) {
    docs.push(`StateDependent: ${entry.attributes.state_dependent}`);
  }

  if (entry.attributes.unavailableStates) {
    docs.push(`UnavailableStates: ${entry.attributes.unavailableStates}`);
  }

  if (hasMultiplicity(entry.attributes.multiline)) {
    docs.push("Multiline: true");
  }

  return emitDoc(docs);
}

function formatParamDoc(path: string, param: Param): string {
  const docs: string[] = [];

  if (isLiteralWithoutValues(param.valuespace)) {
    docs.push(`Cisco schema does not specify a type for ${path} ${param.name}`);
  }

  if (param.description) {
    docs.push(`Description: ${param.description}`);
  }

  if (param.required !== undefined) {
    docs.push(`Required: ${JSON.stringify(param.required)}`);
  }

  if (param.default !== undefined) {
    docs.push(`Default: ${formatDocValue(param.default)}`);
  }

  if (typeof param.valuespace !== "string") {
    if (param.valuespace.Min !== undefined) {
      docs.push(`Min: ${JSON.stringify(param.valuespace.Min)}`);
    }

    if (param.valuespace.Max !== undefined) {
      docs.push(`Max: ${JSON.stringify(param.valuespace.Max)}`);
    }

    if (param.valuespace.Step !== undefined) {
      docs.push(`Step: ${JSON.stringify(param.valuespace.Step)}`);
    }

    if (param.valuespace.MinLength !== undefined) {
      docs.push(`MinLength: ${JSON.stringify(param.valuespace.MinLength)}`);
    }

    if (param.valuespace.MaxLength !== undefined) {
      docs.push(`MaxLength: ${JSON.stringify(param.valuespace.MaxLength)}`);
    }

    if (param.valuespace.Values?.length) {
      docs.push(`Values: ${JSON.stringify(param.valuespace.Values)}`);
    }

    if (param.valuespace.multiple !== undefined) {
      docs.push(`Multiple: ${JSON.stringify(param.valuespace.multiple)}`);
    }
  }

  return emitDoc(docs);
}

function isLiteralWithoutValues(valuespace: Valuespace): boolean {
  if (typeof valuespace === "string") {
    return valuespace === "literal";
  }

  if (valuespace.type !== "Literal" && valuespace.type !== "literal") {
    return false;
  }

  const values = literalValues(valuespace);
  return values === undefined || values.length === 0;
}

function formatMissingTypeDoc(path: string): string {
  return emitDoc([`Cisco schema does not specify a type for ${path}`]);
}

function formatDocValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value) || typeof value === "number" || typeof value === "boolean" || value === null) {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
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

  const values = literalValues(valuespace);

  if (values !== undefined) {
    normalized.Values = sortStrings(values);
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

function normalizeChildren(children: Record<string, EventNode>): Record<string, ReducedEventNode> {
  const normalized: Record<string, ReducedEventNode> = {};

  for (const [name, child] of Object.entries(children).sort(([a], [b]) => a.localeCompare(b))) {
    normalized[name] = normalizeEventNode(child);
  }

  return normalized;
}

function normalizeEventNode(node: EventNode): ReducedEventNode {
  const normalized: ReducedEventNode = {};

  if (node.valuespace !== undefined) {
    normalized.valuespace = normalizeValuespace(node.valuespace);

    if (node.values !== undefined && typeof normalized.valuespace === "string") {
      normalized.valuespace = {
        type: normalized.valuespace,
        Values: sortStrings(node.values),
      };
    }
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
      const params = entry.attributes.params?.map((param) => normalizeParam(param)) ?? [];
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
    source: entry,
    path: entry.path,
    products: sortStrings(entry.products),
    type: entry.type,
    attributes,
  };
}

function signatureValuespace(valuespace: Valuespace | undefined): unknown {
  if (valuespace === undefined) {
    return null;
  }

  if (typeof valuespace === "string") {
    return valuespace;
  }

  return {
    type: valuespace.type ?? null,
    Values: literalValues(valuespace) ? sortStrings(literalValues(valuespace)!) : null,
    multiple: hasMultiplicity(valuespace.multiple),
    Min: valuespace.Min ?? null,
    Max: valuespace.Max ?? null,
    Step: valuespace.Step ?? null,
    MinLength: valuespace.MinLength ?? null,
    MaxLength: valuespace.MaxLength ?? null,
  };
}

function signatureParam(param: Param): unknown {
  return {
    name: param.name,
    description: param.description ?? null,
    required: isTruthyFlag(param.required),
    default: param.default ?? null,
    valuespace: signatureValuespace(param.valuespace),
  };
}

function signatureEventNode(node: EventNode | undefined): unknown {
  if (node === undefined) {
    return null;
  }

  return {
    multiple: hasMultiplicity(node.multiple),
    required: isTruthyFlag(node.required),
    valuespace: signatureValuespace(node.valuespace),
    values: node.values ? sortStrings(node.values) : null,
    children: node.children
      ? Object.fromEntries(
          Object.entries(node.children)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, child]) => [name, signatureEventNode(child)]),
        )
      : null,
  };
}

function entrySignature(entry: SchemaEntry): string {
  const attributes =
    entry.type === "Command"
      ? {
          params: (entry.attributes.params ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((param) => signatureParam(param)),
          multiline: hasMultiplicity(entry.attributes.multiline),
        }
      : entry.type === "Configuration" || entry.type === "Status"
        ? {
            valuespace: signatureValuespace(entry.attributes.valuespace),
          }
        : {
            children: entry.attributes.children
              ? Object.fromEntries(
                  Object.entries(entry.attributes.children)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, child]) => [name, signatureEventNode(child)]),
                )
              : null,
          };

  return JSON.stringify({
    path: entry.path,
    normPath: entry.normPath ?? null,
    type: entry.type,
    docs: {
      access: entry.attributes.access ?? null,
      backend: entry.attributes.backend ?? null,
      description: entry.attributes.description ?? null,
      privacyimpact: entry.attributes.privacyimpact ?? null,
      role: entry.attributes.role ?? null,
      state_dependent: entry.attributes.state_dependent ?? null,
      unavailableStates: entry.attributes.unavailableStates ?? null,
      multiline: hasMultiplicity(entry.attributes.multiline),
    },
    attributes,
  });
}

function mergeEntries(entries: readonly SchemaEntry[]): readonly ReducedEntry[] {
  const groups = new Map<string, ReducedEntry>();

  for (const entry of entries) {
    const reduced = normalizeEntry(entry);
    const signature = entrySignature(entry);

    const existing = groups.get(signature);

    if (existing !== undefined) {
      existing.products = sortStrings([...existing.products, ...reduced.products]);
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

    return JSON.stringify(left.attributes).localeCompare(JSON.stringify(right.attributes));
  });
}

function isCommonEntry(entry: ReducedEntry, allProducts: readonly string[]): boolean {
  return allProducts.every((product) => entry.products.includes(product));
}

function groupEntriesByCommonAndProduct(
  entries: readonly ReducedEntry[],
  allProducts: readonly string[],
): {
  common: ReducedEntry[];
  byProduct: Record<string, ReducedEntry[]>;
} {
  const common = entries.filter((entry) => isCommonEntry(entry, allProducts));
  const byProduct: Record<string, ReducedEntry[]> = {};

  for (const product of allProducts) {
    byProduct[product] = entries.filter(
      (entry) => !isCommonEntry(entry, allProducts) && entry.products.includes(product),
    );
  }

  return { common, byProduct };
}

function groupCommandEntriesByProductSet(
  entries: readonly ReducedEntry[],
  allProducts: readonly string[],
): {
  common: ReducedEntry[];
  sets: Array<{
    key: string;
    products: string[];
    entries: ReducedEntry[];
  }>;
} {
  const { common } = groupEntriesByCommonAndProduct(entries, allProducts);
  const commonSet = new Set(common);
  const bySet = new Map<
    string,
    {
      key: string;
      products: string[];
      entries: ReducedEntry[];
    }
  >();

  for (const entry of entries) {
    if (commonSet.has(entry)) {
      continue;
    }

    const key = entry.products.join("\u001f");
    const existing = bySet.get(key);

    if (existing !== undefined) {
      existing.entries.push(entry);
      continue;
    }

    bySet.set(key, {
      key,
      products: entry.products.slice(),
      entries: [entry],
    });
  }

  return {
    common,
    sets: Array.from(bySet.values()).sort((left, right) => {
      const sizeOrder = left.products.length - right.products.length;

      if (sizeOrder !== 0) {
        return sizeOrder;
      }

      return left.key.localeCompare(right.key);
    }),
  };
}

function uniqueProducts(entries: readonly SchemaEntry[]): readonly string[] {
  return Array.from(new Set(entries.flatMap((entry) => entry.products))).sort((a, b) => a.localeCompare(b));
}

function uniqueKinds(entries: readonly SchemaEntry[]): readonly SchemaEntry["type"][] {
  const kinds: SchemaEntry["type"][] = [];

  for (const kind of new Set(entries.map((entry) => entry.type))) {
    kinds.push(kind);
  }

  return kinds.sort((a, b) => a.localeCompare(b));
}

function renderTuple(items: readonly string[], depth: number, multiline = false): string {
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

  return `{
${fields.map((field) => indent(field, depth + 1)).join("\n")}
${indent("}", depth)}`;
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

function renderEventNode(node: ReducedEventNode, depth: number, path: string): string {
  const fields: string[] = [];

  if (node.children !== undefined) {
    const children = Object.entries(node.children).map(
      ([name, child]) => {
        const childPath = `${path} ${name}`;
        const docs = isLiteralWithoutValues(child.valuespace ?? "") ? formatMissingTypeDoc(childPath) : "";
        return `${docs}${JSON.stringify(name)}: ${renderEventNode(child, depth + 1, childPath)};`;
      },
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

function renderCommandArgsObject(entry: ReducedEntry, depth: number): string {
  const params = (entry.source.attributes.params ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  if (!params.length) {
    return "{}";
  }

  const fields = params.map((param) => {
    const docs = formatParamDoc(entry.path, param);
    return `${docs}${JSON.stringify(param.name)}${isTruthyFlag(param.required) ? "" : "?"}: ${valueType(param.valuespace)};`;
  });

  return renderObject(fields, depth);
}

function renderCommandCallable(entry: ReducedEntry, depth: number, returnTypeName: string): string {
  const params = entry.source.attributes.params ?? [];
  const multiline = hasMultiplicity(entry.source.attributes.multiline);
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) => isTruthyFlag(param.required));
  const argsObject = renderCommandArgsObject(entry, depth + 1);

  if (!multiline) {
    if (!hasParams) {
      return `() => ${returnTypeName}`;
    }

    return hasRequiredParams ? `(args: ${argsObject}) => ${returnTypeName}` : `(args?: ${argsObject}) => ${returnTypeName}`;
  }

  if (!hasParams) {
    return renderObject(
      [`(): ${returnTypeName};`, `(body: string): ${returnTypeName};`],
      depth,
    );
  }

  if (hasRequiredParams) {
    return renderObject(
      [
        `(args: ${argsObject}): ${returnTypeName};`,
        `(args: ${argsObject}, body: string): ${returnTypeName};`,
      ],
      depth,
    );
  }

  return renderObject(
    [
      `(): ${returnTypeName};`,
      `(body: string): ${returnTypeName};`,
      `(args: ${argsObject}): ${returnTypeName};`,
      `(args: ${argsObject}, body: string): ${returnTypeName};`,
    ],
    depth,
  );
}

function buildCommandTree(entries: readonly ReducedEntry[]): CommandTreeNode {
  const root: CommandTreeNode = {
    array: false,
    children: new Map<string, CommandTreeNode>(),
  };

  for (const entry of entries) {
    const segments = entry.path.split(" ");
    let node = root;

    for (const segment of segments) {
      const name = stripIndex(segment);
      const isArray = name !== segment;
      let child = node.children.get(name);

      if (child === undefined) {
        child = {
          array: false,
          children: new Map<string, CommandTreeNode>(),
        };
        node.children.set(name, child);
      }

      if (isArray) {
        child.array = true;
      }

      node = child;
    }

    node.entry = entry;
  }

  return root;
}

function renderCommandNode(node: CommandTreeNode, depth: number, returnTypeName: string): string {
  if (!node.children.size) {
    if (node.entry === undefined) {
      return "{}";
    }

    return renderCommandCallable(node.entry, depth, returnTypeName);
  }

  const fields = Array.from(node.children.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => {
      const value = renderCommandNode(child, depth + 1, returnTypeName);

      if (child.entry !== undefined && !child.children.size) {
        return `${formatEntryDoc(child.entry.source)}${JSON.stringify(name)}: ${child.array ? `Array<${value}>` : value};`;
      }

      return `${JSON.stringify(name)}: ${child.array ? `Array<${value}>` : value};`;
    });

  return renderObject(fields, depth);
}

function renderCommandApiType(aliasName: string, entries: readonly ReducedEntry[]): string {
  if (!entries.length) {
    return `export type ${aliasName}<ReturnType = string> = {};`;
  }

  const tree = buildCommandTree(entries);
  return `export type ${aliasName}<ReturnType = string> = ${renderCommandNode(tree, 0, "ReturnType")};`;
}

function renderCommandApiSection(
  entries: readonly ReducedEntry[],
  allProducts: readonly string[],
): string {
  const commandEntries = entries.filter((entry) => entry.type === "Command");
  const { common, sets } = groupCommandEntriesByProductSet(commandEntries, allProducts);
  const setAliases = sets.map((set, index) => {
    const alias = `CommandApiSet_${index}`;
    return { alias, products: set.products, entries: set.entries };
  });

  const aliasesByProduct: Record<string, string[]> = {};

  for (const product of allProducts) {
    aliasesByProduct[product] = [];
  }

  for (const { alias, products } of setAliases) {
    for (const product of products) {
      aliasesByProduct[product].push(alias);
    }
  }

  const output: string[] = [renderCommandApiType("CommandApiCommon", common)];

  for (const { alias, entries: setEntries } of setAliases) {
    output.push(renderCommandApiType(alias, setEntries));
  }

  const allSetAliases = setAliases.map(({ alias }) => `${alias}<ReturnType>`);

  output.push(
    `export type CommandApiAny<ReturnType = string> = CommandApiCommon<ReturnType>${allSetAliases.length ? ` & ${allSetAliases.join(" & ")}` : ""};`,
  );

  output.push(
    `export type CommandApiByProduct<ReturnType = string> = {
${allProducts
  .map((product) => {
    const aliases = aliasesByProduct[product];

    if (!aliases.length) {
      return `  ${JSON.stringify(product)}: {};`;
    }

    if (aliases.length === 1) {
      return `  ${JSON.stringify(product)}: ${aliases[0]}<ReturnType>;`;
    }

    return `  ${JSON.stringify(product)}: ${aliases
      .map((alias) => `${alias}<ReturnType>`)
      .join(" & ")};`;
  })
  .join("\n")}
};`,
  );

  output.push(
    `export type CommandApi<
  TProduct extends ProductTarget = "any",
  ReturnType = string,
  > = TProduct extends "any" ? CommandApiAny<ReturnType> : TProduct extends Product ? CommandApiCommon<ReturnType> & CommandApiByProduct<ReturnType>[TProduct] : {};`,
  );

  return output.join("\n\n");
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
      attributes = renderEventAttributes(entry.attributes, 3, entry.path);
      break;
  }

  return `{
  path: ${JSON.stringify(entry.path)};
  products: ${renderTuple(entry.products.map((product) => JSON.stringify(product)), 1, false)};
  type: ${JSON.stringify(entry.type)};
  attributes: ${attributes};
}`;
}

function renderCommandAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  const fields = [
    `params: ${renderTuple((attributes.params ?? []).map((param) => renderParam(param, depth + 1)), depth + 1, false)};`,
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

  return renderObject([`valuespace: ${renderValuespace(attributes.valuespace, depth + 1)};`], depth);
}

function renderEventAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
  path: string,
): string {
  return renderObject(
    [
      `children: ${renderObject(
        Object.entries(attributes.children ?? {}).map(
          ([name, child]) => {
            const childPath = `${path} ${name}`;
            const docs = isLiteralWithoutValues(child.valuespace ?? "") ? formatMissingTypeDoc(childPath) : "";
            return `${docs}${JSON.stringify(name)}: ${renderEventNode(child, depth + 2, childPath)};`;
          },
        ),
        depth + 1,
      )};`,
    ],
    depth,
  );
}

function generateSource(schema: SchemaJson): string {
  const allProducts = uniqueProducts(schema.objects);
  const mergedEntries = mergeEntries(schema.objects);
  const kinds = uniqueKinds(schema.objects);
  const commandApi = renderCommandApiSection(mergedEntries, allProducts);
  const union = mergedEntries.map((entry) => `  | ${renderEntry(entry)}`);

  return [
    `export namespace GeneratedRoomOS {`,
    `export type Schema = { objects: readonly Object[] };`,
    `export type Object =\n${union.join("\n")};`,
    `export type Product = ${allProducts.map((product) => JSON.stringify(product)).join(" | ")};`,
    `export type Kind = ${kinds.map((kind) => JSON.stringify(kind)).join(" | ")};`,
    `export type ProductTarget = Product | "any";`,
    `export type Root = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";`,
    `export type xCommandReturnDefault = null;`,
    commandApi,
    `}`
  ].join("\n\n");
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const [inputArg, outputArg] = argv;
  const inputUrl = resolveUrl(inputArg, DEFAULT_INPUT);
  const outputUrl = resolveUrl(outputArg, DEFAULT_OUTPUT);

  const raw = await readFile(inputUrl, "utf8");
  const schema: SchemaJson = JSON.parse(raw);
  const contents = generateSource(schema);

  await mkdir(new URL(".", outputUrl), { recursive: true });
  await writeFile(outputUrl, `${contents}\n`, "utf8");
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
