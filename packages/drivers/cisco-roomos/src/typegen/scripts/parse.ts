import type {
  EventNode,
  Param,
  ParamModel,
  SchemaEntry,
  Tree,
  Valuespace,
  ValuespaceModel,
} from "./types.ts";

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

function makeTree(source: SchemaEntry): Tree {
  return {
    array: false,
    isPath: false,
    source,
    params: [],
    valuespace: null,
    children: {},
  };
}

function literalValues(
  valuespace: Valuespace | ValuespaceModel,
): readonly string[] | undefined {
  if (typeof valuespace === "string") {
    return undefined;
  }

  return (
    valuespace.Values ??
    ("values" in valuespace ? valuespace.values : undefined)
  );
}

function baseValueType(valuespace: Valuespace | ValuespaceModel): string {
  if (typeof valuespace === "string") {
    switch (valuespace) {
      case "Integer":
      case "int":
        return "number";
      case "String":
      case "string":
        return "string";
      case "literal":
        return "JsonValue";
      default:
        return "JsonValue";
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
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "JsonValue";
    case "IntegerArray":
      return "number";
    case "StringArray":
      return "string";
    case "LiteralArray":
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "JsonValue";
    case "literal":
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "JsonValue";
    case "int":
      return "number";
    case "string":
      return "string";
    default:
      return "JsonValue";
  }
}

function valueType(
  valuespace: Valuespace | ValuespaceModel | null | undefined,
): string {
  if (valuespace === undefined || valuespace === null) {
    return "JsonValue";
  }

  const isArrayType =
    typeof valuespace === "string" ? false : (
      /Array$/.test(valuespace.type ?? "") ||
      hasMultiplicity(valuespace.multiple)
    );
  const base = baseValueType(valuespace);
  return isArrayType ? `Array<${base}>` : base;
}

function isLiteralWithoutValues(
  valuespace: Valuespace | ValuespaceModel,
): boolean {
  if (typeof valuespace === "string") {
    return valuespace === "literal";
  }

  if (valuespace.type !== "Literal" && valuespace.type !== "literal") {
    return false;
  }

  const values = literalValues(valuespace);
  return values === undefined || values.length === 0;
}

function normalizeValuespace(valuespace: Valuespace): ValuespaceModel {
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

function normalizeParam(param: Param): ParamModel {
  const normalized: ParamModel = {
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
  source: SchemaEntry,
): Record<string, Tree> {
  const normalized: Record<string, Tree> = {};

  for (const [name, child] of Object.entries(children).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    normalized[name] = normalizeEventNode(child, source);
  }

  return normalized;
}

function normalizeEventNode(node: EventNode, source: SchemaEntry): Tree {
  const normalized = makeTree(source);

  if (node.valuespace !== undefined) {
    normalized.valuespace = normalizeValuespace(node.valuespace);

    if (
      node.values !== undefined &&
      typeof normalized.valuespace === "string"
    ) {
      normalized.valuespace = {
        type: normalized.valuespace,
        Values: sortStrings(node.values),
      };
    }
  }

  if (hasMultiplicity(node.multiple)) {
    normalized.array = true;
  }

  normalized.isPath = true;

  if (node.children !== undefined) {
    normalized.children = normalizeChildren(node.children, source);
  }

  return normalized;
}

function normalizeEntry(entry: SchemaEntry): Tree {
  const normalized = makeTree(entry);
  normalized.isPath = true;

  switch (entry.type) {
    case "Command": {
      const params =
        entry.attributes.params?.map((param) => normalizeParam(param)) ?? [];
      params.sort((a, b) => a.name.localeCompare(b.name));
      normalized.params = params;

      break;
    }
    case "Configuration":
    case "Status": {
      normalized.valuespace =
        entry.attributes.valuespace !== undefined ?
          normalizeValuespace(entry.attributes.valuespace)
        : null;
      break;
    }
    case "Event": {
      normalized.children = normalizeChildren(
        entry.attributes.children ?? {},
        entry,
      );
      break;
    }
  }

  return normalized;
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
    Values:
      literalValues(valuespace) ?
        sortStrings(literalValues(valuespace)!)
      : null,
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

function isCommonEntry(entry: Tree, allProducts: readonly string[]): boolean {
  return allProducts.every((product) =>
    entry.source.products.includes(product),
  );
}

function removeBrackets(segment: string): string {
  let out = "";
  let depth = 0;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];

    if (ch === "[") {
      depth++;
      continue;
    }

    if (ch === "]" && depth > 0) {
      depth--;
      continue;
    }

    if (depth === 0) {
      out += ch;
    }
  }

  return out;
}

export {
  baseValueType,
  hasMultiplicity,
  isCommonEntry,
  isLiteralWithoutValues,
  isTruthyFlag,
  literalValues,
  normalizeChildren,
  normalizeEntry,
  normalizeEventNode,
  normalizeParam,
  normalizeValuespace,
  removeBrackets,
  signatureParam,
  signatureValuespace,
  sortStrings,
  valueType,
};
