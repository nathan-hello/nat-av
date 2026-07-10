import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

type Json = any;

const OUTPUT_DIR = new URL("../output/", import.meta.url);
const TEMP_DIR = new URL("../output/.tmp/", import.meta.url);
const VALIDATE_DIR = new URL("../output/validate/", import.meta.url);

function isPromiseType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const sym = type.symbol ?? (type as ts.TypeReference).target?.symbol;
  return sym?.name === "Promise";
}

function awaitType(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  const awaited = (
    checker as unknown as {
      getAwaitedType?(t: ts.Type): ts.Type | undefined;
    }
  ).getAwaitedType?.(type);
  if (awaited) return awaited;
  if (isPromiseType(checker, type)) {
    const args = checker.getTypeArguments(type as ts.TypeReference);
    if (args.length) return args[0]!;
  }
  return type;
}

function isVoidOrUndefined(type: ts.Type): boolean {
  return !!(type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined));
}

function isTuple(type: ts.Type): boolean {
  const objFlags =
    (type as unknown as { objectFlags?: number }).objectFlags ?? 0;
  if (objFlags & ts.ObjectFlags.Tuple) return true;
  const target = (type as unknown as { target?: ts.ObjectType }).target;
  return !!target && !!(target.objectFlags & ts.ObjectFlags.Tuple);
}

function tupleElementOptional(type: ts.Type, index: number): boolean {
  const target =
    (type as unknown as { target?: ts.TupleType }).target ??
    (type as unknown as ts.TupleType);
  const flags = target?.elementFlags;
  if (flags && index < flags.length) {
    return !!(flags[index]! & ts.ElementFlags.Optional);
  }
  return false;
}

function typeName(type: ts.Type): string | undefined {
  return (
    type.symbol?.name ??
    // TSAS: TypeReference targets expose the intrinsic symbol for built-in generic types.
    (type as ts.TypeReference).target?.symbol?.name
  );
}

function typeArguments(
  checker: ts.TypeChecker,
  type: ts.Type,
): readonly ts.Type[] {
  if (!type.symbol && !(type as ts.TypeReference).target) return [];
  return checker.getTypeArguments(
    // TSAS: Built-in collection names are only handled for TypeReference values.
    type as ts.TypeReference,
  );
}

function typeToSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  optional = false,
  visiting: WeakSet<ts.Type> = new WeakSet(),
): Json {
  const opt = optional ? { optional: true as const } : {};

  if ((type.flags & ts.TypeFlags.Boolean) === ts.TypeFlags.Boolean) {
    return { type: "boolean", ...opt };
  }
  if (type.flags & ts.TypeFlags.String) return { type: "string", ...opt };
  if (type.flags & ts.TypeFlags.Number) return { type: "number", ...opt };
  if (type.flags & ts.TypeFlags.Null) {
    return { type: "literal", value: null, ...opt };
  }
  if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return { type: "undefined", ...opt };
  }
  if (type.flags & ts.TypeFlags.StringLiteral) {
    return {
      type: "literal",
      value: (type as ts.StringLiteralType).value,
      ...opt,
    };
  }
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return {
      type: "literal",
      value: (type as ts.NumberLiteralType).value,
      ...opt,
    };
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    const v =
      (type as unknown as { intrinsicName: string }).intrinsicName === "true";
    return { type: "literal", value: v, ...opt };
  }

  if (visiting.has(type)) {
    return { type: "recursive", ...opt };
  }
  visiting.add(type);

  try {
    if (type.flags & ts.TypeFlags.Union) {
      const parts = (type as ts.UnionType).types.filter(
        (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
      );
      if (parts.length === 0) return { type: "undefined", ...opt };
      const allBooleanLits = parts.every(
        (t) => (t.flags & ts.TypeFlags.BooleanLiteral) !== 0,
      );
      if (allBooleanLits) {
        return { type: "boolean", ...opt };
      }
      if (parts.length === 1) {
        return typeToSchema(checker, parts[0]!, optional, visiting);
      }
      return {
        type: "union",
        anyOf: parts.map((t) => typeToSchema(checker, t, false, visiting)),
        ...opt,
      };
    }

    const name = typeName(type);
    if (name === "Map" || name === "ReadonlyMap") {
      const [key, value] = typeArguments(checker, type);
      return {
        type: "map",
        keys: typeToSchema(checker, key ?? type, false, visiting),
        values: typeToSchema(checker, value ?? type, false, visiting),
        ...opt,
      };
    }
    if (name === "Set" || name === "ReadonlySet") {
      const [item] = typeArguments(checker, type);
      return {
        type: "set",
        items: typeToSchema(checker, item ?? type, false, visiting),
        ...opt,
      };
    }
    if (name === "Uint8Array" || name === "Buffer") {
      return { type: "bytes", ...opt };
    }
    if (name === "Date") {
      return { type: "date", ...opt };
    }

    if (
      checker.isArrayType(type) ||
      (!!(type.flags & ts.TypeFlags.Intersection) &&
        // TSAS: TypeFlags.Intersection guarantees this compiler type has constituents.
        (type as ts.IntersectionType).types.some((part) =>
          checker.isArrayType(part),
        ))
    ) {
      const elem =
        type.getNumberIndexType?.() ??
        checker.getTypeArguments(type as ts.TypeReference)[0];
      return {
        type: "array",
        items: [typeToSchema(checker, elem, false, visiting)],
        ...opt,
      };
    }

    if (isTuple(type)) {
      const elems = checker.getTypeArguments(type as ts.TypeReference);
      const items = elems.map((e, i) =>
        typeToSchema(checker, e, tupleElementOptional(type, i), visiting),
      );
      return { type: "tuple", items, ...opt };
    }

    if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
      // Symbol-keyed members (for example Symbol.iterator on Map) cannot be
      // represented in JSON and are excluded by `keyof T & string` as well.
      const props = checker
        .getPropertiesOfType(type)
        .filter((sym) => !sym.name.startsWith("__@"));
      const properties = Object.fromEntries(
        props.map((sym) => {
          const propType = checker.getTypeOfSymbol(sym);
          const propOpt =
            (sym.flags & ts.SymbolFlags.Optional) !== 0 ||
            isPropertyOptional(sym) ||
            includesUndefined(propType);
          return [sym.name, typeToSchema(checker, propType, propOpt, visiting)];
        }),
      );
      return { type: "object", properties, ...opt };
    }

    return { type: "any", ...opt };
  } finally {
    visiting.delete(type);
  }
}

function isPropertyOptional(sym: ts.Symbol): boolean {
  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (decl && ts.isPropertyDeclaration(decl)) {
    return decl.questionToken !== undefined;
  }
  if (decl && ts.isPropertySignature(decl)) {
    return decl.questionToken !== undefined;
  }
  if (decl && ts.isPropertyAssignment(decl)) {
    return false;
  }
  return (sym.flags & ts.SymbolFlags.Optional) !== 0;
}

function includesUndefined(type: ts.Type): boolean {
  return (
    (type.flags & ts.TypeFlags.Undefined) !== 0 ||
    (!!(type.flags & ts.TypeFlags.Union) &&
      // TSAS: TypeFlags.Union guarantees this compiler type exposes union members.
      (type as ts.UnionType).types.some(
        (part) => (part.flags & ts.TypeFlags.Undefined) !== 0,
      ))
  );
}

function schemaOfReturn(
  checker: ts.TypeChecker,
  returnType: ts.Type,
  visiting: WeakSet<ts.Type>,
): Json {
  const awaited = awaitType(checker, returnType);
  if (isVoidOrUndefined(awaited)) {
    return { type: "literal", value: null };
  }
  return typeToSchema(checker, awaited, false, visiting);
}

function generateApiNodes(
  checker: ts.TypeChecker,
  apiType: ts.Type,
  visiting: WeakSet<ts.Type>,
): Json[] {
  const props = checker
    .getPropertiesOfType(apiType)
    .filter((prop) => !prop.name.startsWith("__@"));
  const nodes: Json[] = [];

  for (const prop of props) {
    const propType = checker.getTypeOfSymbol(prop);
    const signatures = propType.getCallSignatures();

    if (signatures.length > 0) {
      const sig = signatures[0]!;
      const params = sig.getParameters();
      const args: Json[] = [];
      for (const p of params) {
        const decl = p.valueDeclaration;
        if (decl && ts.isParameter(decl) && decl.dotDotDotToken) {
          const restType = checker.getTypeOfSymbolAtLocation(
            p,
            decl ?? ({} as ts.Node),
          );
          if (isTuple(restType)) {
            const elems = checker.getTypeArguments(
              restType as ts.TypeReference,
            );
            elems.forEach((e, i) => {
              const opt = tupleElementOptional(restType, i);
              args.push(typeToSchema(checker, e, opt, visiting));
            });
            continue;
          }
        }
        const opt =
          !!decl &&
          ts.isParameter(decl) &&
          (decl.questionToken !== undefined || decl.initializer !== undefined);
        const ptype = checker.getTypeOfSymbolAtLocation(
          p,
          decl ?? ({} as ts.Node),
        );
        args.push(typeToSchema(checker, ptype, opt, visiting));
      }
      const returns = schemaOfReturn(checker, sig.getReturnType(), visiting);
      nodes.push({ name: prop.name, returns, args });
    } else {
      const children = generateApiNodes(checker, propType, visiting);
      nodes.push({ name: prop.name, children });
    }
  }

  return nodes;
}

function formatNode(node: Json, indent: number): string {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);
  if (Array.isArray(node)) {
    if (node.length === 0) return "[]";
    const items = node.map((item) => formatNode(item, indent + 1));
    return `[\n${padInner}${items.join(`,\n${padInner}`)}\n${pad}]`;
  }
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node).filter(
      ([key]) => !key.startsWith("__"),
    );
    if (entries.length === 0) return "{}";
    const fields = entries.map(
      ([k, v]) =>
        `${padInner}${JSON.stringify(k)}: ${formatNode(v, indent + 1)}`,
    );
    return `{\n${fields.join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(node);
}

function formatSchema(nodes: Json[]): string {
  return `[\n${nodes
    .map((n) => `  ${formatNode(n, 1).replace(/^/gm, "")}`)
    .join(",\n")}\n]`;
}

interface DriverEntry {
  name: string;
  nodes: Json[];
}

interface ValidationEntry {
  path: string[];
  node: Json;
}

function validationEntries(
  nodes: readonly Json[],
  path: readonly string[] = [],
): ValidationEntry[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    if ("children" in node) return validationEntries(node.children, nextPath);
    return [{ path: nextPath, node }];
  });
}

function extractDrivers(
  checker: ts.TypeChecker,
  driversType: ts.Type,
): DriverEntry[] {
  if (!isTuple(driversType)) {
    throw new Error(
      'natav["drivers"] is not a tuple; cannot enumerate driver instances',
    );
  }

  const elements = checker.getTypeArguments(driversType as ts.TypeReference);
  const entries: DriverEntry[] = [];

  for (const elementType of elements) {
    const nameSym = checker.getPropertyOfType(elementType, "name");
    if (!nameSym) continue;
    const nameType = checker.getTypeOfSymbol(nameSym);
    if (!(nameType.flags & ts.TypeFlags.StringLiteral)) continue;
    const driverName = (nameType as ts.StringLiteralType).value;
    if (driverName === "schema") continue;

    const apiSym = checker.getPropertyOfType(elementType, "api");
    if (!apiSym) continue;
    const apiType = checker.getTypeOfSymbol(apiSym);

    const visiting: WeakSet<ts.Type> = new WeakSet();
    const nodes = generateApiNodes(checker, apiType, visiting);
    entries.push({ name: driverName, nodes });
  }

  return entries;
}

async function emitSchemaFile(entry: DriverEntry): Promise<void> {
  const safeName = entry.name.replace(/[^a-zA-Z0-9_]/g, "_");
  const contents = `${formatSchema(entry.nodes)}\n`;
  const fileUrl = new URL(`${safeName}.json`, OUTPUT_DIR);
  await fs.writeFile(fileUrl, contents, "utf8");
}

async function emitManifest(entries: readonly DriverEntry[]): Promise<void> {
  const schemas = Object.fromEntries(
    entries.map((entry) => [
      entry.name,
      `${entry.name.replace(/[^a-zA-Z0-9_]/g, "_")}.json`,
    ]),
  );
  await fs.writeFile(
    new URL("state.json", OUTPUT_DIR),
    `${JSON.stringify(schemas, null, 2)}\n`,
    "utf8",
  );
}

function apiPath(path: readonly string[]): string {
  return path.map((part) => `[${JSON.stringify(part)}]`).join("");
}

async function emitValidationFiles(entry: DriverEntry): Promise<void> {
  const safeName = entry.name.replace(/[^a-zA-Z0-9_]/g, "_");
  const directory = new URL(`${safeName}/`, VALIDATE_DIR);
  await fs.mkdir(directory, { recursive: true });

  const entries = validationEntries(entry.nodes);
  for (const [index, { path, node }] of entries.entries()) {
    const name = path[path.length - 1]!;
    const body = formatNode(node, 0);
    const contents =
      `import type { Drivers } from "@av/index";\n` +
      `import type { Schema } from "@drivers/natav/schema/types";\n` +
      `import type { natav } from "@server/index";\n\n` +
      `type Api = Drivers.FromName<natav["drivers"], ${JSON.stringify(entry.name)}>["api"];\n\n` +
      `const schema: Schema.ApiNode<${JSON.stringify(name)}, Api${apiPath(path)}> = ${body} as const;\n\n` +
      `export default schema;\n`;
    await fs.writeFile(
      new URL(`${String(index).padStart(5, "0")}.ts`, directory),
      contents,
      "utf8",
    );
  }
}

let program: ts.Program;

async function main(): Promise<void> {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ".");

  await fs.mkdir(TEMP_DIR, { recursive: true });
  const tempFile = new URL("_drivers.ts", TEMP_DIR);
  await fs.writeFile(
    tempFile,
    `import type { natav } from "@server/index";\n` +
      `type _Drivers = natav["drivers"];\n`,
    "utf8",
  );

  try {
    program = ts.createProgram({
      rootNames: [tempFile.pathname, configPath],
      options: { ...parsed.options, noEmit: true },
    });
    const checker = program.getTypeChecker();

    const sourceFile = program.getSourceFile(tempFile.pathname);
    if (!sourceFile) throw new Error("temp file not loaded into program");

    let typeAlias: ts.TypeAliasDeclaration | undefined;
    function visit(node: ts.Node): void {
      if (
        !typeAlias &&
        ts.isTypeAliasDeclaration(node) &&
        node.name.text === "_Drivers"
      ) {
        typeAlias = node;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (!typeAlias) throw new Error("_Drivers type alias not found");

    const driversType = checker.getTypeAtLocation(typeAlias);
    const entries = extractDrivers(checker, driversType);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Clear stale runtime schemas and validation units before regenerating them.
    const existing = await fs.readdir(OUTPUT_DIR);
    for (const file of existing) {
      if (file === ".tmp" || file === "validate") continue;
      if (file.endsWith(".ts") || file.endsWith(".json")) {
        await fs.unlink(new URL(file, OUTPUT_DIR)).catch(() => {});
      }
    }
    await fs.rm(VALIDATE_DIR, { recursive: true, force: true });

    for (const entry of entries) {
      await emitSchemaFile(entry);
      await emitValidationFiles(entry);
      const safeName = entry.name.replace(/[^a-zA-Z0-9_]/g, "_");
      console.log(`generated output/${safeName}.json`);
    }
    await emitManifest(entries);
  } finally {
    await fs.rm(TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
