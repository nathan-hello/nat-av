import {
  hasMultiplicity,
  isLiteralWithoutValues,
  isTruthyFlag,
  groupEntriesByProductSet,
  valueType,
} from "./parse.ts";

import type {
  EntryModel,
  GeneratedModel,
  GroupedTreeModel,
  Param,
  ParamModel,
  SchemaEntry,
  Tree,
} from "./types.ts";

function escapeComment(value: string): string {
  return value.replaceAll("*/", "* /");
}

function emitDoc(lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `\n/**\n${lines.map((line) => ` * ${escapeComment(line)}`).join("\n")}\n */\n`;
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

function formatParamDoc(path: string, param: Param | ParamModel): string {
  const docs: string[] = [];

  if (isLiteralWithoutValues(param.valuespace)) {
    docs.push(`Cisco schema does not specify a type for ${path} ${param.name}`);
  }

  if ("description" in param && typeof param.description === "string") {
    docs.push(`Description: ${param.description}`);
  }

  if (param.required !== undefined) {
    docs.push(`Required: ${JSON.stringify(param.required)}`);
  }

  if ("default" in param && param.default !== undefined) {
    docs.push(`Default: ${JSON.stringify(param.default)}`);
  }

  if (typeof param.valuespace !== "string") {
    if ("Min" in param.valuespace && param.valuespace.Min !== undefined) {
      docs.push(`Min: ${JSON.stringify(param.valuespace.Min)}`);
    }

    if ("Max" in param.valuespace && param.valuespace.Max !== undefined) {
      docs.push(`Max: ${JSON.stringify(param.valuespace.Max)}`);
    }

    if ("Step" in param.valuespace && param.valuespace.Step !== undefined) {
      docs.push(`Step: ${JSON.stringify(param.valuespace.Step)}`);
    }

    if (
      "MinLength" in param.valuespace &&
      param.valuespace.MinLength !== undefined
    ) {
      docs.push(`MinLength: ${JSON.stringify(param.valuespace.MinLength)}`);
    }

    if (
      "MaxLength" in param.valuespace &&
      param.valuespace.MaxLength !== undefined
    ) {
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

function renderObject(fields: readonly string[]): string {
  if (!fields.length) {
    return "{}";
  }

  return `{ ${fields.join(" ")} }`;
}

function renderArrayValue(value: string, array: boolean | number): string {
  if (typeof array === "number") {
    if (array <= 0) {
      return "[]";
    }

    return `[${Array.from({ length: array }, () => value).join(", ")}]`;
  }

  return array ? `Array<${value}>` : value;
}


function renderNodeDoc(node: Tree): string {
  if (node.isPath) {
    return formatEntryDoc(node.source);
  }

  return "";
}

function renderCommandArgsObject(
  path: string,
  params: readonly ParamModel[],
): string {
  if (!params.length) {
    return "{}";
  }

  const fields = params.map((param) => {
    const docs = formatParamDoc(path, param);
    const optional = isTruthyFlag(param.required) ? "" : "?";
    return `${docs}${JSON.stringify(param.name)}${optional}: ${valueType(param.valuespace)};`;
  });

  return renderObject(fields);
}

function renderCommandCallableFields(
  path: string,
  params: readonly ParamModel[],
  returnTypeName: string,
): string[] {
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) =>
    isTruthyFlag(param.required),
  );
  const argsObject = renderCommandArgsObject(path, params);

  if (!hasParams) {
    return [`(): ${returnTypeName};`, `(body: string): ${returnTypeName};`];
  }

  if (hasRequiredParams) {
    return [
      `(args: ${argsObject}): ${returnTypeName};`,
      `(args: ${argsObject}, body: string): ${returnTypeName};`,
    ];
  }

  return [
    `(): ${returnTypeName};`,
    `(body: string): ${returnTypeName};`,
    `(args: ${argsObject}): ${returnTypeName};`,
    `(args: ${argsObject}, body: string): ${returnTypeName};`,
  ];
}

function renderCommandCallableType(
  path: string,
  params: readonly ParamModel[],
  returnTypeName: string,
  forceObject = false,
): string {
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) =>
    isTruthyFlag(param.required),
  );
  const argsObject = renderCommandArgsObject(path, params);

  if (!forceObject) {
    if (!hasParams) {
      return `() => ${returnTypeName}`;
    }

    return hasRequiredParams ?
        `(args: ${argsObject}) => ${returnTypeName}`
      : `(args?: ${argsObject}) => ${returnTypeName}`;
  }

  return renderObject(
    renderCommandCallableFields(path, params, returnTypeName),
  );
}

function renderTreeFields(
  node: Tree,
  returnTypeName: string | ((name: string, child: Tree) => string),
): string[] {
  const fields: string[] = [];

  for (const [name, child] of Object.entries(node.children ?? {})) {
    if (!child) {
      return fields;
    }
    const docs = renderNodeDoc(child);
    const value = renderTreeNode(
      child,
      typeof returnTypeName === "function" ?
        returnTypeName(name, child)
      : returnTypeName,
    );
    const wrappedValue = renderArrayValue(value, child.isArray);
    fields.push(`${docs}${JSON.stringify(name)}: ${wrappedValue};`);
  }

  return fields;
}

function renderTreeNode(node: Tree, returnTypeName: string): string {
  const hasChildren = Object.keys(node.children ?? {}).length > 0;

  if (hasChildren) {
    return renderObject(renderTreeFields(node, () => returnTypeName));
  }

  if (node.params.length > 0) {
    return renderCommandCallableType(
      node.source.path,
      node.params,
      returnTypeName,
    );
  }

  if (node.valuespace !== null) {
    return valueType(node.valuespace);
  }

  return "JSONValue";
}

function renderInterface(
  name: string,
  fields: readonly string[],
  options?: {
    typeParameters?: string;
    extendsTypes?: readonly string[];
  },
): string {
  const typeParameters = options?.typeParameters ?? "";
  const extendsTypes = options?.extendsTypes?.filter(Boolean) ?? [];
  const extendsClause =
    extendsTypes.length > 0 ? ` extends ${extendsTypes.join(", ")}` : "";

  if (!fields.length) {
    return `export interface ${name}${typeParameters}${extendsClause} {}`;
  }

  return `export interface ${name}${typeParameters}${extendsClause} {
${fields.join("\n")}
}`;
}

function renderByProductInterface(
  name: string,
  allProducts: readonly string[],
  valueForProduct: (product: string) => string,
  typeParameters = "",
): string {
  return renderInterface(
    name,
    allProducts.map(
      (product) => `${JSON.stringify(product)}: ${valueForProduct(product)};`,
    ),
    { typeParameters },
  );
}

function renderCommandApiSection(
  section: GroupedTreeModel,
  allProducts: readonly string[],
): string {
  const setNames = section.sets.map((_, index) => `CommandApiSet_${index}`);
  const aliasesByProduct: Record<string, string[]> = Object.fromEntries(
    allProducts.map((product) => [product, []]),
  );

  section.sets.forEach((set, index) => {
    const name = setNames[index];

    for (const product of set.products) {
      aliasesByProduct[product].push(name);
    }
  });

  const output: string[] = [
    renderInterface(
      "CommandApiCommon",
      renderTreeFields(section.common, `JSONValue`),
    ),
  ];

  section.sets.forEach((set, index) => {
    output.push(
      renderInterface(setNames[index], renderTreeFields(set.tree, "JSONValue")),
    );
  });

  output.push(
    `export type CommandApiAny = Merge<${[
      "CommandApiCommon",
      ...setNames.map((name) => `${name}`),
    ].join(" & ")}>;`,
  );

  output.push(
    renderByProductInterface("CommandApiByProduct", allProducts, (product) => {
      const aliases = aliasesByProduct[product];

      if (!aliases.length) {
        return "{}";
      }

      return aliases.map((alias) => `${alias}`).join(" & ");
    }),
  );

  output.push(`export type CommandApi<
  TProduct extends ProductTarget = "any",
> = TProduct extends "any" ? CommandApiAny
  : TProduct extends Product ? Merge<CommandApiCommon & CommandApiByProduct[TProduct]>
  : {};`);

  return output.join("\n");
}

function renderEventSection(
  baseName: "Event",
  section: GroupedTreeModel,
  entries: readonly EntryModel[],
  allProducts: readonly string[],
) {
  const { common, sets } = groupEntriesByProductSet(entries, allProducts);

  const setNames = sets.map((_, index) => `${baseName}Set_${index}`);
  const aliasesByProduct: Record<string, string[]> = Object.fromEntries(
    allProducts.map((product) => [product, []]),
  );

  sets.forEach((set, index) => {
    const name = setNames[index];

    for (const product of set.products) {
      aliasesByProduct[product].push(name);
    }
  });

  const output: string[] = [
    renderInterface(
      `${baseName}Common`,
      renderEventFields(common, section.common),
    ),
  ];

  sets.forEach((set, index) => {
    output.push(
      renderInterface(
        setNames[index],
        renderEventFields(set.entries, section.sets[index].tree),
      ),
    );
  });

  output.push(
    `export type ${baseName}Any = Merge<${[
      `${baseName}Common`,
      ...setNames,
    ].join(" & ")}>;`,
  );

  output.push(
    renderByProductInterface(`${baseName}ByProduct`, allProducts, (product) => {
      const aliases = aliasesByProduct[product];

      if (!aliases.length) {
        return "{}";
      }

      return aliases.join(" & ");
    }),
  );

  output.push(`export type ${baseName}<TProduct extends ProductTarget = "any"> =
  TProduct extends "any" ? ${baseName}Any
  : TProduct extends Product ? Merge<${baseName}Common & ${baseName}ByProduct[TProduct]>
  : {};`);

  return output.join("\n");
}

function renderStateSection(
  baseName: "Configuration" | "Status",
  section: GroupedTreeModel,
  allProducts: readonly string[],
): string {
  const setNames = section.sets.map((_, index) => `${baseName}Set_${index}`);
  const aliasesByProduct: Record<string, string[]> = Object.fromEntries(
    allProducts.map((product) => [product, []]),
  );

  section.sets.forEach((set, index) => {
    const name = setNames[index];

    for (const product of set.products) {
      aliasesByProduct[product].push(name);
    }
  });

  const output: string[] = [
    renderInterface(
      `${baseName}Common`,
      renderTreeFields(section.common, "never"),
    ),
  ];

  section.sets.forEach((set, index) => {
    output.push(
      renderInterface(setNames[index], renderTreeFields(set.tree, "never")),
    );
  });

  output.push(
    `export type ${baseName}Any = Merge<${[
      `${baseName}Common`,
      ...setNames,
    ].join(" & ")}>;`,
  );

  output.push(
    renderByProductInterface(`${baseName}ByProduct`, allProducts, (product) => {
      const aliases = aliasesByProduct[product];

      if (!aliases.length) {
        return "{}";
      }

      return aliases.join(" & ");
    }),
  );

  output.push(`export type ${baseName}<TProduct extends ProductTarget = "any"> =
  TProduct extends "any" ? ${baseName}Any
  : TProduct extends Product ? Merge<${baseName}Common & ${baseName}ByProduct[TProduct]>
  : {};`);

  return output.join("\n");
}

function findEventTreeNode(
  root: Tree,
  path: string,
): Tree | undefined {
  let node: Tree | undefined = root.children?.Event ?? root;

  for (const segment of path.split(" ")) {
    node = node?.children?.[segment];

    if (node === undefined) {
      return undefined;
    }
  }

  return node;
}

function renderEventFields(
  entries: readonly EntryModel[],
  root: Tree,
): string[] {
  return entries.map((entry) => {
    const key = entry.source.normPath ?? entry.path;
    const docs = formatEntryDoc(entry.source);
    const node = findEventTreeNode(root, entry.path);
    const value = node ? renderObject(renderTreeFields(node, "never")) : "{}";

    return `${docs}${JSON.stringify(key)}: ${value};`;
  });
}

function renderNamespace(model: GeneratedModel): string {
  return [
    "export namespace GeneratedRoomOS {",
    "type Merge<T> = { [K in keyof T]: T[K] };",
    "type JSONPrimitive = string | number | boolean | null;",
    "type JSONObject = { [key: string]: JSONValue }",
    "type JSONArray = JSONValue[]",
    "export type JSONValue = JSONPrimitive | JSONObject | JSONArray",
    `export type Product = ${model.products.map((product) => JSON.stringify(product)).join(" | ")};`,
    `export type Kind = ${model.kinds.map((kind) => JSON.stringify(kind)).join(" | ")};`,
    'export type ProductTarget = Product | "any";',
    'export type Root = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";',
    "export type xCommandReturnDefault = null;",
    renderCommandApiSection(model.commandApi, model.products),
    renderStateSection("Configuration", model.configuration, model.products),
    renderStateSection("Status", model.status, model.products),
    renderEventSection(
      "Event",
      model.event,
      model.entries.filter((entry) => entry.type === "Event"),
      model.products,
    ),
    "}",
  ].join("\n\n");
}

export { renderNamespace as renderSource };
