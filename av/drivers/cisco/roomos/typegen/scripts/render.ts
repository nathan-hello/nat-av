import { hasMultiplicity, isLiteralWithoutValues, isTruthyFlag, valueType } from "./parse.ts";

import type {
  EntryModel,
  EventNodeModel,
  GeneratedModel,
  GroupedTreeModel,
  Param,
  ParamModel,
  SchemaEntry,
  TypeTreeNode,
  ValuespaceModel,
} from "./types.ts";

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

function formatMissingTypeDoc(path: string): string {
  return emitDoc([`Cisco schema does not specify a type for ${path}`]);
}

function renderObject(fields: readonly string[], depth: number): string {
  if (!fields.length) {
    return "{}";
  }

  return `{
${fields.map((field) => indent(field, depth + 1)).join("\n")}
${indent("}", depth)}`;
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

function renderValuespace(valuespace: ValuespaceModel, depth: number): string {
  void depth;
  return valueType(valuespace);
}

function renderParam(param: ParamModel, depth: number): string {
  const fields = [`name: ${JSON.stringify(param.name)};`];

  if (param.required) {
    fields.push("required: true;");
  }

  fields.push(`valuespace: ${renderValuespace(param.valuespace, depth + 1)};`);
  return renderObject(fields, depth);
}

function renderEventModel(node: EventNodeModel, depth: number, path: string): string {
  const fields: string[] = [];

  if (node.children !== undefined) {
    const children = Object.entries(node.children).map(([name, child]) => {
      const childPath = `${path} ${name}`;
      const docs =
        child.valuespace !== undefined && isLiteralWithoutValues(child.valuespace) ?
          formatMissingTypeDoc(childPath)
        : "";
      return `${docs}${JSON.stringify(name)}: ${renderEventModel(child, depth + 1, childPath)};`;
    });
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

function renderEntry(entry: EntryModel): string {
  let attributes = "{}";

  switch (entry.type) {
    case "Command":
      attributes = renderObject(
        [
          `params: ${renderTuple(
            (entry.params ?? []).map((param) => renderParam(param, 4)),
            4,
            false,
          )};`,
          ...(entry.multiline ? ["multiline: true;"] : []),
        ],
        3,
      );
      break;
    case "Configuration":
    case "Status":
      if (entry.valuespace === undefined) {
        throw new Error("Missing valuespace while rendering value attributes");
      }
      attributes = renderObject(
        [`valuespace: ${renderValuespace(entry.valuespace, 4)};`],
        3,
      );
      break;
    case "Event":
      attributes = renderObject(
        [
          `children: ${renderObject(
            Object.entries(entry.children ?? {}).map(([name, child]) => {
              const childPath = `${entry.path} ${name}`;
              const docs =
                child.valuespace !== undefined &&
                isLiteralWithoutValues(child.valuespace) ?
                  formatMissingTypeDoc(childPath)
                : "";
              return `${docs}${JSON.stringify(name)}: ${renderEventModel(child, 5, childPath)};`;
            }),
            4,
          )};`,
        ],
        3,
      );
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

function sortedChildren(node: TypeTreeNode): Array<[string, TypeTreeNode]> {
  return Object.entries(node.children ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
}

function renderNodeDoc(node: TypeTreeNode): string {
  if (node.source !== undefined) {
    return formatEntryDoc(node.source);
  }

  if (node.missingTypePath !== undefined) {
    return formatMissingTypeDoc(node.missingTypePath);
  }

  return "";
}

function renderCommandArgsObject(
  path: string,
  params: readonly ParamModel[],
  depth: number,
): string {
  if (!params.length) {
    return "{}";
  }

  const fields = params.map((param) => {
    const docs = formatParamDoc(path, param);
    const optional = isTruthyFlag(param.required) ? "" : "?";
    return `${docs}${JSON.stringify(param.name)}${optional}: ${valueType(param.valuespace)};`;
  });

  return renderObject(fields, depth);
}

function renderCommandCallableFields(
  path: string,
  params: readonly ParamModel[],
  multiline: boolean,
  depth: number,
  returnTypeName: string,
): string[] {
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) => isTruthyFlag(param.required));
  const argsObject = renderCommandArgsObject(path, params, depth + 1);

  if (!multiline) {
    if (!hasParams) {
      return [`(): ${returnTypeName};`];
    }

    return [
      `${hasRequiredParams ? "(args" : "(args?"}: ${argsObject}): ${returnTypeName};`,
    ];
  }

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
  multiline: boolean,
  depth: number,
  returnTypeName: string,
  forceObject = false,
): string {
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) => isTruthyFlag(param.required));
  const argsObject = renderCommandArgsObject(path, params, depth + 1);

  if (!multiline && !forceObject) {
    if (!hasParams) {
      return `() => ${returnTypeName}`;
    }

    return hasRequiredParams ?
        `(args: ${argsObject}) => ${returnTypeName}`
      : `(args?: ${argsObject}) => ${returnTypeName}`;
  }

  return renderObject(
    renderCommandCallableFields(path, params, multiline, depth, returnTypeName),
    depth,
  );
}

function renderTreeFields(
  node: TypeTreeNode,
  depth: number,
  returnTypeName: string,
): string[] {
  const fields: string[] = [];

  if (node.callable !== undefined && node.source !== undefined) {
    fields.push(
      ...renderCommandCallableFields(
        node.source.path,
        node.callable.params,
        node.callable.multiline === true,
        depth,
        returnTypeName,
      ),
    );
  }

  for (const [name, child] of sortedChildren(node)) {
    const docs = renderNodeDoc(child);
    const value = renderTreeNode(child, depth + 1, returnTypeName);
    const wrappedValue = child.array ? `Array<${value}>` : value;
    fields.push(`${docs}${JSON.stringify(name)}: ${wrappedValue};`);
  }

  return fields;
}

function renderTreeNode(
  node: TypeTreeNode,
  depth: number,
  returnTypeName: string,
): string {
  const hasChildren = sortedChildren(node).length > 0;

  if (hasChildren) {
    return renderObject(renderTreeFields(node, depth, returnTypeName), depth);
  }

  if (node.callable !== undefined && node.source !== undefined) {
    return renderCommandCallableType(
      node.source.path,
      node.callable.params,
      node.callable.multiline === true,
      depth,
      returnTypeName,
    );
  }

  if (node.valuespace !== undefined) {
    return valueType(node.valuespace);
  }

  return "{}";
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
${fields.map((field) => indent(field, 1)).join("\n")}
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
    allProducts.map((product) => `${JSON.stringify(product)}: ${valueForProduct(product)};`),
    { typeParameters },
  );
}

function renderCommandApiSection(section: GroupedTreeModel, allProducts: readonly string[]): string {
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
      renderTreeFields(section.common, 0, "ReturnType"),
      { typeParameters: "<ReturnType = string>" },
    ),
  ];

  section.sets.forEach((set, index) => {
    output.push(
      renderInterface(
        setNames[index],
        renderTreeFields(set.tree, 0, "ReturnType"),
        { typeParameters: "<ReturnType = string>" },
      ),
    );
  });

  output.push(
    `export type CommandApiAny<ReturnType = unknown> = Merge<${[
      "CommandApiCommon<ReturnType>",
      ...setNames.map((name) => `${name}<ReturnType>`),
    ].join(" & ")}>;`,
  );

  output.push(
    renderByProductInterface(
      "CommandApiByProduct",
      allProducts,
      (product) => {
        const aliases = aliasesByProduct[product];

        if (!aliases.length) {
          return "{}";
        }

        return aliases.map((alias) => `${alias}<ReturnType>`).join(" & ");
      },
      "<ReturnType = string>",
    ),
  );

  output.push(`export type CommandApi<
  TProduct extends ProductTarget = "any",
  ReturnType = string,
> = TProduct extends "any" ? CommandApiAny<ReturnType>
  : TProduct extends Product ? Merge<CommandApiCommon<ReturnType> & CommandApiByProduct<ReturnType>[TProduct]>
  : {};`);

  return output.join("\n\n");
}

function renderStateSection(
  baseName: "ConfigurationState" | "StatusState" | "FeedbackState",
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
    renderInterface(`${baseName}Common`, renderTreeFields(section.common, 0, "never")),
  ];

  section.sets.forEach((set, index) => {
    output.push(
      renderInterface(setNames[index], renderTreeFields(set.tree, 0, "never")),
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

  return output.join("\n\n");
}

function renderNamespace(model: GeneratedModel): string {
  const objects = model.entries.map((entry) => `  | ${renderEntry(entry)}`).join("\n");

  return [
    "export namespace GeneratedRoomOS {",
    "type Merge<T> = { [K in keyof T]: T[K] };",
    `export type Object =\n${objects};`,
    `export type Product = ${model.products.map((product) => JSON.stringify(product)).join(" | ")};`,
    `export type Kind = ${model.kinds.map((kind) => JSON.stringify(kind)).join(" | ")};`,
    'export type ProductTarget = Product | "any";',
    'export type Root = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";',
    "export type xCommandReturnDefault = null;",
    renderCommandApiSection(model.commandApi, model.products),
    renderStateSection(
      "ConfigurationState",
      model.configurationState,
      model.products,
    ),
    renderStateSection("StatusState", model.statusState, model.products),
    renderStateSection("FeedbackState", model.feedbackState, model.products),
    "}",
  ].join("\n\n");
}

export { renderNamespace as renderSource };
