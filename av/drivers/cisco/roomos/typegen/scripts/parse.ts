import type {
  EntryModel,
  EventNodeModel,
  EventNode,
  ParamModel,
  Param,
  ProductSetGroup,
  SchemaEntry,
  ValuespaceModel,
  Valuespace,
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

function literalValues(
  valuespace: Valuespace | ValuespaceModel,
): readonly string[] | undefined {
  if (typeof valuespace === "string") {
    return undefined;
  }

  return valuespace.Values ?? ("values" in valuespace ? valuespace.values : undefined);
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
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "unknown";
    case "IntegerArray":
      return "number";
    case "StringArray":
      return "string";
    case "LiteralArray":
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "unknown";
    case "literal":
      return literalValues(valuespace)?.length ?
          literalValues(valuespace)!
            .map((value) => JSON.stringify(value))
            .join(" | ")
        : "unknown";
    case "int":
      return "number";
    case "string":
      return "string";
    default:
      return "unknown";
  }
}

function valueType(
  valuespace: Valuespace | ValuespaceModel | undefined,
): string {
  if (valuespace === undefined) {
    return "unknown";
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
): Record<string, EventNodeModel> {
  const normalized: Record<string, EventNodeModel> = {};

  for (const [name, child] of Object.entries(children).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    normalized[name] = normalizeEventNode(child);
  }

  return normalized;
}

function normalizeEventNode(node: EventNode): EventNodeModel {
  const normalized: EventNodeModel = {};

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

function normalizeEntry(entry: SchemaEntry): EntryModel {
  const normalized: EntryModel = {
    source: entry,
    path: entry.path,
    products: sortStrings(entry.products),
    type: entry.type,
  };

  switch (entry.type) {
    case "Command": {
      const params =
        entry.attributes.params?.map((param) => normalizeParam(param)) ?? [];
      params.sort((a, b) => a.name.localeCompare(b.name));
      normalized.params = params;

      if (hasMultiplicity(entry.attributes.multiline)) {
        normalized.multiline = true;
      }

      break;
    }
    case "Configuration":
    case "Status": {
      if (entry.attributes.valuespace === undefined) {
        throw new Error(`Missing valuespace for ${entry.type} ${entry.path}`);
      }

      normalized.valuespace = normalizeValuespace(entry.attributes.valuespace);
      break;
    }
    case "Event": {
      normalized.children = normalizeChildren(entry.attributes.children ?? {});
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

function signatureEventNode(node: EventNode | undefined): unknown {
  if (node === undefined) {
    return null;
  }

  return {
    multiple: hasMultiplicity(node.multiple),
    required: isTruthyFlag(node.required),
    valuespace: signatureValuespace(node.valuespace),
    values: node.values ? sortStrings(node.values) : null,
    children:
      node.children ?
        Object.fromEntries(
          Object.entries(node.children)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, child]) => [name, signatureEventNode(child)]),
        )
      : null,
  };
}

function entrySignature(entry: SchemaEntry): string {
  const attributes =
    entry.type === "Command" ?
      {
        params: (entry.attributes.params ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((param) => signatureParam(param)),
        multiline: hasMultiplicity(entry.attributes.multiline),
      }
    : entry.type === "Configuration" || entry.type === "Status" ?
      {
        valuespace: signatureValuespace(entry.attributes.valuespace),
      }
    : {
        children:
          entry.attributes.children ?
            Object.fromEntries(
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

function mergeEntries(
  entries: readonly SchemaEntry[],
): readonly EntryModel[] {
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

function isCommonEntry(
  entry: EntryModel,
  allProducts: readonly string[],
): boolean {
  return allProducts.every((product) => entry.products.includes(product));
}

function groupEntriesByCommonAndProduct(
  entries: readonly EntryModel[],
  allProducts: readonly string[],
): {
  common: EntryModel[];
  byProduct: Record<string, EntryModel[]>;
} {
  const common = entries.filter((entry) => isCommonEntry(entry, allProducts));
  const byProduct: Record<string, EntryModel[]> = {};

  for (const product of allProducts) {
    byProduct[product] = entries.filter(
      (entry) =>
        !isCommonEntry(entry, allProducts) && entry.products.includes(product),
    );
  }

  return { common, byProduct };
}

function groupEntriesByProductSet(
  entries: readonly EntryModel[],
  allProducts: readonly string[],
): {
  common: EntryModel[];
  sets: ProductSetGroup[];
} {
  const { common } = groupEntriesByCommonAndProduct(entries, allProducts);
  const commonEntries = new Set(common);
  const groupsByProductSet = new Map<string, ProductSetGroup>();

  for (const entry of entries) {
    if (commonEntries.has(entry)) {
      continue;
    }

    const key = JSON.stringify(entry.products.sort());
    let group = groupsByProductSet.get(key);

    if (group === undefined) {
      group = {
        key,
        products: [...entry.products],
        entries: [],
      };

      groupsByProductSet.set(key, group);
    }

    group.entries.push(entry);
  }

  const sets = [...groupsByProductSet.values()].sort((left, right) => {
    const sizeOrder = left.products.length - right.products.length;

    if (sizeOrder !== 0) {
      return sizeOrder;
    }

    return left.key.localeCompare(right.key);
  });

  return {
    common,
    sets,
  };
}

function uniqueProducts(entries: readonly SchemaEntry[]): readonly string[] {
  return Array.from(new Set(entries.flatMap((entry) => entry.products))).sort();
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
  entrySignature,
  groupEntriesByCommonAndProduct,
  groupEntriesByProductSet,
  hasMultiplicity,
  isCommonEntry,
  isLiteralWithoutValues,
  isTruthyFlag,
  literalValues,
  mergeEntries,
  normalizeChildren,
  normalizeEntry,
  normalizeEventNode,
  normalizeParam,
  normalizeValuespace,
  signatureEventNode,
  signatureParam,
  signatureValuespace,
  sortStrings,
  uniqueKinds,
  uniqueProducts,
  valueType,
  removeBrackets,
};
