import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

type Json = any;

const OUTPUT_DIR = new URL("../output/", import.meta.url);
const STATE_FILE = new URL("../output/state.ts", import.meta.url);
const TEMP_DIR = new URL("../output/.tmp/", import.meta.url);

function isPromiseType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const sym = type.symbol ?? (type as ts.TypeReference).target?.symbol;
  return sym?.name === "Promise";
}

function awaitType(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  const awaited = (checker as unknown as {
    getAwaitedType?(t: ts.Type): ts.Type | undefined;
  }).getAwaitedType?.(type);
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
  const objFlags = (type as unknown as { objectFlags?: number }).objectFlags ?? 0;
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
    return { type: "any", ...opt };
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

    if (checker.isArrayType(type)) {
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

    if (type.flags & ts.TypeFlags.Object) {
      const props = checker.getPropertiesOfType(type);
      const fields = props.map((sym) => {
        const propType = checker.getTypeOfSymbol(sym);
        const propOpt =
          (sym.flags & ts.SymbolFlags.Optional) !== 0 ||
          isPropertyOptional(sym);
        return {
          name: sym.name,
          value: typeToSchema(checker, propType, propOpt, visiting),
        };
      });
      return { type: "object", fields, ...opt };
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
  const props = checker.getPropertiesOfType(apiType);
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
            const elems = checker.getTypeArguments(restType as ts.TypeReference);
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
      const ret = schemaOfReturn(checker, sig.getReturnType(), visiting);
      nodes.push({ name: prop.name, returns: ret, args });
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
    return `[\n${padInner}${items.join(`,\n${padInner}`)},\n${pad}]`;
  }
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node);
    if (entries.length === 0) return "{}";
    const fields = entries.map(
      ([k, v]) =>
        `${padInner}${JSON.stringify(k)}: ${formatNode(v, indent + 1)}`,
    );
    return `{\n${fields.join(",\n")},\n${pad}}`;
  }
  return JSON.stringify(node);
}

function formatSchema(nodes: Json[]): string {
  return `[\n${nodes
    .map((n) => `  ${formatNode(n, 1).replace(/^/gm, "")}`)
    .join(",\n")},\n]`;
}

interface DriverEntry {
  name: string;
  nodes: Json[];
}

function extractDrivers(
  checker: ts.TypeChecker,
  driversType: ts.Type,
): DriverEntry[] {
  if (!isTuple(driversType)) {
    throw new Error(
      "natav[\"drivers\"] is not a tuple; cannot enumerate driver instances",
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
  const body = formatSchema(entry.nodes).replace(/^/gm, "  ").trimStart();
  const contents =
    `const schema = ${body} as const;\n\n` +
    `export default schema;\n`;
  const fileUrl = new URL(`${safeName}.ts`, OUTPUT_DIR);
  await fs.writeFile(fileUrl, contents, "utf8");
}

async function emitStateFile(entries: readonly DriverEntry[]): Promise<void> {
  const imports = entries
    .map((e) => {
      const safeName = e.name.replace(/[^a-zA-Z0-9_]/g, "_");
      return `import schema_${safeName} from "@drivers/natav/schema/output/${safeName}";`;
    })
    .join("\n");
  const fields = entries
    .map((e) => {
      const safeName = e.name.replace(/[^a-zA-Z0-9_]/g, "_");
      return `  ${JSON.stringify(e.name)}: schema_${safeName},`;
    })
    .join("\n");
  const contents =
    imports +
    `\n\n` +
    `export const state: Record<string, readonly unknown[]> = {\n${fields}\n};\n`;
  await fs.writeFile(STATE_FILE, contents, "utf8");
}

let program: ts.Program;

async function main(): Promise<void> {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ".",
  );

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

    // Clear stale generated schema files (except state.ts and .tmp/)
    const existing = await fs.readdir(OUTPUT_DIR);
    for (const file of existing) {
      if (file === ".tmp" || file === "state.ts") continue;
      if (file.endsWith(".ts")) {
        await fs.unlink(new URL(file, OUTPUT_DIR)).catch(() => {});
      }
    }

    for (const entry of entries) {
      await emitSchemaFile(entry);
      const safeName = entry.name.replace(/[^a-zA-Z0-9_]/g, "_");
      console.log(`generated output/${safeName}.ts`);
    }

    await emitStateFile(entries);
    console.log("generated output/state.ts");
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
