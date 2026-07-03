import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

type Json = any;

interface Target {
  name: string;
  file: string;
  className: string;
}

const TARGETS: readonly Target[] = [
  {
    name: "video-wall",
    file: "vendor/drivers/decoder/display/index.ts",
    className: "DisplayManager",
  },
  {
    name: "roomos",
    file: "vendor/drivers/cisco/roomos/index.ts",
    className: "CiscoRoomOS",
  },
];

const OUTPUT_DIR = new URL("../output/", import.meta.url);
const STATE_FILE = new URL("../output/state.ts", import.meta.url);

function driverImportPath(file: string): string {
  let p = file.replace(/\/index\.ts$/, "").replace(/\.ts$/, "");
  if (p.startsWith("vendor/drivers/"))
    p = "@drivers/" + p.slice("vendor/drivers/".length);
  else if (p.startsWith("vendor/av/"))
    p = "@av/" + p.slice("vendor/av/".length);
  return p;
}

function findClass(
  sourceFile: ts.SourceFile,
  className: string,
): ts.ClassDeclaration | undefined {
  let result: ts.ClassDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (
      !result &&
      ts.isClassDeclaration(node) &&
      node.name?.text === className
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

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
    if (args.length) return args[0];
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

function typeToSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  optional = false,
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
    if (parts.length === 1) return typeToSchema(checker, parts[0]!, optional);
    return {
      type: "union",
      anyOf: parts.map((t) => typeToSchema(checker, t)),
      ...opt,
    };
  }

  if (checker.isArrayType(type)) {
    const elem =
      type.getNumberIndexType?.() ??
      checker.getTypeArguments(type as ts.TypeReference)[0];
    return {
      type: "array",
      items: [typeToSchema(checker, elem)],
      ...opt,
    };
  }

  if (isTuple(type)) {
    const elems = checker.getTypeArguments(type as ts.TypeReference);
    const items = elems.map((e, i) =>
      typeToSchema(checker, e, tupleElementOptional(type, i)),
    );
    return { type: "tuple", items, ...opt };
  }

  if (type.flags & ts.TypeFlags.Object) {
    const props = checker.getPropertiesOfType(type);
    const fields = props.map((sym) => {
      const propType = checker.getTypeOfSymbol(sym);
      const propOpt =
        (sym.flags & ts.SymbolFlags.Optional) !== 0 || isPropertyOptional(sym);
      return {
        name: sym.name,
        value: typeToSchema(checker, propType, propOpt),
      };
    });
    return { type: "object", fields, ...opt };
  }

  return { type: "any", ...opt };
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

function schemaOfReturn(checker: ts.TypeChecker, returnType: ts.Type): Json {
  const awaited = awaitType(checker, returnType);
  if (isVoidOrUndefined(awaited)) {
    return { type: "literal", value: null };
  }
  return typeToSchema(checker, awaited);
}

function generateApiNodes(
  checker: ts.TypeChecker,
  apiType: ts.Type,
  basePath = "",
): Json[] {
  const props = checker.getPropertiesOfType(apiType);
  const nodes: Json[] = [];

  for (const prop of props) {
    const propType = checker.getTypeOfSymbol(prop);
    const signatures = propType.getCallSignatures();
    const fullName = prop.name;

    if (signatures.length > 0) {
      const sig = signatures[0]!;
      const params = sig.getParameters();
      const args = params.map((p) => {
        const decl = p.valueDeclaration;
        const opt =
          !!decl &&
          ts.isParameter(decl) &&
          (decl.questionToken !== undefined || decl.initializer !== undefined);
        const ptype = checker.getTypeOfSymbolAtLocation(
          p,
          decl ?? ({} as ts.Node),
        );
        return typeToSchema(checker, ptype, opt);
      });
      const ret = schemaOfReturn(checker, sig.getReturnType());
      nodes.push({ name: fullName, returns: ret, args });
    } else {
      const children = generateApiNodes(checker, propType, fullName);
      nodes.push({ name: fullName, children });
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

async function emitSchemaFile(target: Target, nodes: Json[]): Promise<void> {
  const importPath = driverImportPath(target.file);
  const body = formatSchema(nodes).replace(/^/gm, "  ").trimStart();
  const contents =
    `import type ${target.className} from "${importPath}";\n` +
    `import { type Schema } from "../types";\n\n` +
    `const schema: Schema.Schema<${target.className}> = ${body};\n\n` +
    `export default schema;\n`;
  const fileUrl = new URL(`${target.name}.ts`, OUTPUT_DIR);
  await fs.writeFile(fileUrl, contents, "utf8");
}

async function emitStateFile(targets: readonly Target[]): Promise<void> {
  const imports = targets
    .map((t) => `import schema from "@drivers/natav/schema/output/${t.name}";`)
    .join("\n");
  const entries = targets
    .map((t) => `  ${JSON.stringify(t.name)}: schema,`)
    .join("\n");
  const contents =
    `import type { Driver } from "@av/drivers";\n` +
    imports +
    `\nimport type { Schema } from "../types";\n\n` +
    `export const state: Record<string, Schema.Schema<Driver>> = {\n${entries}\n};\n`;
  await fs.writeFile(STATE_FILE, contents, "utf8");
}

async function generate(
  checker: ts.TypeChecker,
  target: Target,
): Promise<Json[]> {
  const sourceFile = program.getSourceFile(target.file);
  if (!sourceFile) throw new Error(`source not found: ${target.file}`);

  const classDecl = findClass(sourceFile, target.className);
  if (!classDecl) throw new Error(`class ${target.className} not found`);

  let apiType: ts.Type | undefined;
  for (const member of classDecl.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === "api"
    ) {
      apiType = checker.getTypeAtLocation(member.initializer ?? member);
      break;
    }
  }

  if (!apiType) {
    const classSymbol = checker.getSymbolAtLocation(classDecl.name!);
    if (classSymbol) {
      const instType = checker.getDeclaredTypeOfSymbol(classSymbol);
      const apiSym = instType.getProperty("api");
      if (apiSym) apiType = checker.getTypeOfSymbol(apiSym);
    }
  }

  if (!apiType) throw new Error(`api not found on ${target.className}`);
  return generateApiNodes(checker, apiType);
}

let program: ts.Program;

async function main(): Promise<void> {
  const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ".");

  program = ts.createProgram({
    rootNames: [...TARGETS.map((t) => t.file), configPath],
    options: { ...parsed.options, noEmit: true },
  });
  const checker = program.getTypeChecker();

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    const nodes = await generate(checker, target);
    await emitSchemaFile(target, nodes);
    console.log(`generated output/${target.name}.ts`);
  }

  await emitStateFile(TARGETS);
  console.log("generated output/state.ts");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
