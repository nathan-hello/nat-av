import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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

function formatDocValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value) || typeof value === "number" || typeof value === "boolean" || value === null) {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

function emitDoc(lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `/**\n${lines.map((line) => ` * ${escapeComment(line)}`).join("\n")}\n */\n`;
}

function hasMultiplicity(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== "0" && value !== "False";
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "True";
}

function safeAliasSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_");
}

function uniqueProducts(entries: readonly SchemaEntry[]): readonly string[] {
  return Array.from(
    new Set(entries.flatMap((entry) => entry.products)),
  ).sort((a, b) => a.localeCompare(b));
}

function isCommonEntry(entry: SchemaEntry, allProducts: readonly string[]): boolean {
  return allProducts.every((product) => entry.products.includes(product));
}

function groupEntriesByCommonAndProduct(
  entries: readonly SchemaEntry[],
  allProducts: readonly string[],
): {
  common: SchemaEntry[];
  byProduct: Record<string, SchemaEntry[]>;
} {
  const common = entries.filter((entry) => isCommonEntry(entry, allProducts));
  const byProduct: Record<string, SchemaEntry[]> = {};

  for (const product of allProducts) {
    byProduct[product] = entries.filter(
      (entry) => !isCommonEntry(entry, allProducts) && entry.products.includes(product),
    );
  }

  return { common, byProduct };
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
        return "string";
      default:
        return "unknown";
    }
  }

  const { type } = valuespace;

  switch (type) {
    case "Integer":
      return "number";
    case "String":
      return "string";
    case "Boolean":
      return "boolean";
    case "Literal":
      return valuespace.Values?.length ? valuespace.Values.map((value) => JSON.stringify(value)).join(" | ") : "string";
    case "IntegerArray":
      return "number";
    case "StringArray":
      return "string";
    case "LiteralArray":
      return valuespace.Values?.length ? valuespace.Values.map((value) => JSON.stringify(value)).join(" | ") : "string";
    case "literal":
      return valuespace.Values?.length ? valuespace.Values.map((value) => JSON.stringify(value)).join(" | ") : "string";
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
    typeof valuespace === "string" ? false
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

function formatParamDoc(param: Param): string {
  const docs: string[] = [];

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

function renderParamsType(params: readonly Param[] | undefined): string {
  if (!params?.length) {
    return "{}";
  }

  const fields = params.map((param) => {
    const optional = !isTruthyFlag(param.required);
    return `${formatParamDoc(param)}${JSON.stringify(param.name)}${optional ? "?" : ""}: ${valueType(param.valuespace)};`;
  });

  return `{
${fields.map((field) => indent(field, 1)).join("\n")}
}`;
}

function renderEventNode(node: EventNode): string {
  if (node.children) {
    const fields = Object.entries(node.children).map(([name, child]) => {
      const optional = !isTruthyFlag(child.required);
      const rendered = renderEventNode(child);
      return `${JSON.stringify(name)}${optional ? "?" : ""}: ${rendered};`;
    });

    const objectType = `{
${fields.map((field) => indent(field, 1)).join("\n")}
}`;

    return hasMultiplicity(node.multiple) ? `Array<${objectType}>` : objectType;
  }

  const rendered = valueType(node.valuespace);
  return hasMultiplicity(node.multiple) ? `Array<${rendered}>` : rendered;
}

function renderEntryMap(
  aliasName: string,
  entries: readonly SchemaEntry[],
  renderValue: (entry: SchemaEntry) => string,
): string {
  if (!entries.length) {
    return `export type ${aliasName} = {};`;
  }

  const fields = entries
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => {
      return `${formatEntryDoc(entry)}${JSON.stringify(entry.path)}: ${renderValue(entry)};`;
    });

  return `export type ${aliasName} = {
${fields.map((field) => indent(field, 1)).join("\n")}
};`;
}

function renderProductMaps(
  baseAlias: string,
  entries: readonly SchemaEntry[],
  renderValue: (entry: SchemaEntry) => string,
  allProducts: readonly string[],
): string {
  const { common, byProduct } = groupEntriesByCommonAndProduct(entries, allProducts);
  const productAliases = allProducts.map((product) => {
    const alias = `${baseAlias}Product_${safeAliasSuffix(product)}`;
    return { product, alias, entries: byProduct[product] };
  });

  const output: string[] = [renderEntryMap(`${baseAlias}Common`, common, renderValue)];

  for (const { alias, entries: productEntries } of productAliases) {
    output.push(renderEntryMap(alias, productEntries, renderValue));
  }

  output.push(
    `export type ${baseAlias}ByProduct = {
${productAliases
  .map(({ product, alias }) => `  ${JSON.stringify(product)}: ${alias};`)
  .join("\n")}
};`,
  );

  output.push(
    `export type ${baseAlias}<Product extends RoomOSProductTarget = "any"> =
  ${baseAlias}Common & (Product extends RoomOSProduct ? ${baseAlias}ByProduct[Product] : {});`,
  );

  return output.join("\n\n");
}

function renderRootSection(
  schema: SchemaJson,
  kind: SchemaEntry["type"],
  allProducts: readonly string[],
): string {
  const entries = schema.objects.filter((entry) => entry.type === kind);

  switch (kind) {
    case "Command":
      return [
        `export type xCommandReturnDefault = null;`,
        renderProductMaps("RoomOSCommandArgs", entries, (entry) => renderParamsType(entry.attributes.params), allProducts),
        renderProductMaps("RoomOSCommandReturn", entries, () => "xCommandReturnDefault", allProducts),
        renderProductMaps(
          "RoomOSCommandBody",
          entries.filter((entry) => hasMultiplicity(entry.attributes.multiline)),
          () => "string",
          allProducts,
        ),
        `export namespace xCommand {
  export type ArgsCommon = RoomOSCommandArgsCommon;
  export type ArgsByProduct = RoomOSCommandArgsByProduct;
  export type Args<Product extends RoomOSProductTarget = "any"> = RoomOSCommandArgs<Product>;

  export type ReturnDefault = xCommandReturnDefault;
  export type ReturnCommon = RoomOSCommandReturnCommon;
  export type ReturnByProduct = RoomOSCommandReturnByProduct;
  export type Return<Product extends RoomOSProductTarget = "any"> = RoomOSCommandReturn<Product>;

  export type BodyCommon = RoomOSCommandBodyCommon;
  export type BodyByProduct = RoomOSCommandBodyByProduct;
  export type Body<Product extends RoomOSProductTarget = "any"> = RoomOSCommandBody<Product>;
}`,
      ].join("\n\n");
    case "Configuration":
      return [
        renderProductMaps(
          "RoomOSConfigurationValue",
          entries,
          (entry) => valueType(entry.attributes.valuespace),
          allProducts,
        ),
        `export namespace xConfiguration {
  export type ValueCommon = RoomOSConfigurationValueCommon;
  export type ValueByProduct = RoomOSConfigurationValueByProduct;
  export type Value<Product extends RoomOSProductTarget = "any"> = RoomOSConfigurationValue<Product>;
}`,
      ].join("\n\n");
    case "Status":
      return [
        renderProductMaps(
          "RoomOSStatusValue",
          entries,
          (entry) => valueType(entry.attributes.valuespace),
          allProducts,
        ),
        `export namespace xStatus {
  export type ValueCommon = RoomOSStatusValueCommon;
  export type ValueByProduct = RoomOSStatusValueByProduct;
  export type Value<Product extends RoomOSProductTarget = "any"> = RoomOSStatusValue<Product>;
}`,
      ].join("\n\n");
    case "Event":
      return [
        renderProductMaps(
          "RoomOSFeedbackPayload",
          entries,
          (entry) => renderEventNode({ children: entry.attributes.children ?? {} }),
          allProducts,
        ),
        `export namespace xFeedback {
  export type PayloadCommon = RoomOSFeedbackPayloadCommon;
  export type PayloadByProduct = RoomOSFeedbackPayloadByProduct;
  export type Payload<Product extends RoomOSProductTarget = "any"> = RoomOSFeedbackPayload<Product>;
}`,
      ].join("\n\n");
  }

  return "";
}

function generateSource(schema: SchemaJson): string {
  const allProducts = uniqueProducts(schema.objects);
  const schemaJson = JSON.stringify(schema, null, 2);

  return [
    `const roomOSSchema = ${schemaJson} as const;`,
    `export default roomOSSchema;`,
    `export type RoomOSSchema = typeof roomOSSchema;`,
    `export type RoomOSObject = RoomOSSchema["objects"][number];`,
    `export type RoomOSProduct = RoomOSObject["products"][number];`,
    `export type RoomOSKind = RoomOSObject["type"];`,
    `export type RoomOSProductTarget = RoomOSProduct | "any";`,
    `export type RoomOSRoot = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";`,
    renderRootSection(schema, "Command", allProducts),
    renderRootSection(schema, "Configuration", allProducts),
    renderRootSection(schema, "Status", allProducts),
    renderRootSection(schema, "Event", allProducts),
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
