import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  groupCommandEntriesByProductSet,
  hasMultiplicity,
  isLiteralWithoutValues,
  isTruthyFlag,
  mergeEntries,
  removeBrackets,
  uniqueKinds,
  uniqueProducts,
  valueType,
} from "./parse.ts";

import type {
  CommandTreeNode,
  ReducedEntry,
  ReducedEventNode,
  ReducedParam,
  ReducedValuespace,
  SchemaJson,
} from "./types.ts";

import { render } from "./render.ts";

const FILE_INPUT = new URL(
  "../schemas/11.33.1 October 2025.json",
  import.meta.url,
);
const FILE_OUTPUT = new URL("../schemas/11.33.1.ts", import.meta.url);

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
      `Values: ${render.tuple(
        value.Values.map((item) => JSON.stringify(item)),
        depth,
        false,
      )};`,
    );
  }

  if (value.multiple) {
    fields.push("multiple: true;");
  }

  return render.object(fields, depth);
}

function renderParam(param: ReducedParam, depth: number): string {
  const fields = [`name: ${JSON.stringify(param.name)};`];

  if (param.required) {
    fields.push("required: true;");
  }

  fields.push(`valuespace: ${renderValuespace(param.valuespace, depth + 1)};`);
  return render.object(fields, depth);
}

function renderEventNode(
  node: ReducedEventNode,
  depth: number,
  path: string,
): string {
  const fields: string[] = [];

  if (node.children !== undefined) {
    const children = Object.entries(node.children).map(([name, child]) => {
      const childPath = `${path} ${name}`;
      const docs =
        isLiteralWithoutValues(child.valuespace ?? "") ?
          render.doc.missing(childPath)
        : "";
      return `${docs}${JSON.stringify(name)}: ${renderEventNode(child, depth + 1, childPath)};`;
    });
    fields.push(`children: ${render.object(children, depth + 1)};`);
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

  return render.object(fields, depth);
}

function renderCommandArgsObject(entry: ReducedEntry, depth: number): string {
  const params = (entry.source.attributes.params ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!params.length) {
    return "{}";
  }

  const fields = params.map((param) => {
    const docs = render.doc.param(entry.path, param);
    return `${docs}${JSON.stringify(param.name)}${isTruthyFlag(param.required) ? "" : "?"}: ${valueType(param.valuespace)};`;
  });

  return render.object(fields, depth);
}

function renderCommandCallable(
  entry: ReducedEntry,
  depth: number,
  returnTypeName: string,
): string {
  const params = entry.source.attributes.params ?? [];
  const multiline = hasMultiplicity(entry.source.attributes.multiline);
  const hasParams = params.length > 0;
  const hasRequiredParams = params.some((param) =>
    isTruthyFlag(param.required),
  );
  const argsObject = renderCommandArgsObject(entry, depth + 1);

  if (!multiline) {
    if (!hasParams) {
      return `() => ${returnTypeName}`;
    }

    return hasRequiredParams ?
        `(args: ${argsObject}) => ${returnTypeName}`
      : `(args?: ${argsObject}) => ${returnTypeName}`;
  }

  if (!hasParams) {
    return render.object(
      [`(): ${returnTypeName};`, `(body: string): ${returnTypeName};`],
      depth,
    );
  }

  if (hasRequiredParams) {
    return render.object(
      [
        `(args: ${argsObject}): ${returnTypeName};`,
        `(args: ${argsObject}, body: string): ${returnTypeName};`,
      ],
      depth,
    );
  }

  return render.object(
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
      const name = removeBrackets(segment);
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

function renderCommandNode(
  node: CommandTreeNode,
  depth: number,
  returnTypeName: string,
): string {
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
        return `${render.doc.entry(child.entry.source)}${JSON.stringify(name)}: ${child.array ? `Array<${value}>` : value};`;
      }

      return `${JSON.stringify(name)}: ${child.array ? `Array<${value}>` : value};`;
    });

  return render.object(fields, depth);
}

function renderCommandApiType(
  aliasName: string,
  entries: readonly ReducedEntry[],
): string {
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
  const { common, sets } = groupCommandEntriesByProductSet(
    commandEntries,
    allProducts,
  );
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
    `export type CommandApiAny<ReturnType = unknown> = CommandApiCommon<ReturnType>${allSetAliases.length ? ` & ${allSetAliases.join(" & ")}` : ""};`,
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
  products: ${render.tuple(
    entry.products.map((product) => JSON.stringify(product)),
    1,
    false,
  )};
  type: ${JSON.stringify(entry.type)};
  attributes: ${attributes};
}`;
}

function renderCommandAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  const fields = [
    `params: ${render.tuple(
      (attributes.params ?? []).map((param) => renderParam(param, depth + 1)),
      depth + 1,
      false,
    )};`,
  ];

  if (attributes.multiline) {
    fields.push("multiline: true;");
  }

  return render.object(fields, depth);
}

function renderValueAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
): string {
  if (attributes.valuespace === undefined) {
    throw new Error("Missing valuespace while rendering value attributes");
  }

  return render.object(
    [`valuespace: ${renderValuespace(attributes.valuespace, depth + 1)};`],
    depth,
  );
}

function renderEventAttributes(
  attributes: ReducedEntry["attributes"],
  depth: number,
  path: string,
): string {
  return render.object(
    [
      `children: ${render.object(
        Object.entries(attributes.children ?? {}).map(([name, child]) => {
          const childPath = `${path} ${name}`;
          const docs =
            isLiteralWithoutValues(child.valuespace ?? "") ?
              render.doc.missing(childPath)
            : "";
          return `${docs}${JSON.stringify(name)}: ${renderEventNode(child, depth + 2, childPath)};`;
        }),
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
    `export type Object =\n${union.join("\n")};`,
    `export type Product = ${allProducts.map((product) => JSON.stringify(product)).join(" | ")};`,
    `export type Kind = ${kinds.map((kind) => JSON.stringify(kind)).join(" | ")};`,
    `export type ProductTarget = Product | "any";`,
    `export type Root = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";`,
    `export type xCommandReturnDefault = null;`,
    commandApi,
    `}`,
  ].join("\n\n");
}

async function main(): Promise<void> {
  const raw = await readFile(FILE_INPUT, "utf8");
  const schema: SchemaJson = JSON.parse(raw);
  const contents = generateSource(schema);

  await mkdir(new URL(".", FILE_OUTPUT), { recursive: true });
  await writeFile(FILE_OUTPUT, `${contents}\n`, "utf8");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
