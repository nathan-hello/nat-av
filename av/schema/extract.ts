import path from "node:path";

import { Node, Project, type Node as MorphNode, type Symbol, type Type } from "ts-morph";

import type {
  ApiSurfaceSchema,
  MethodSchema,
  ParameterSchema,
  PropertySchema,
  SourceSchema,
  TypeSchema,
} from "./types.ts";

type ExtractApiSurfaceArgs = {
  entry: string;
  exportName: string;
  rootDir?: string;
  tsConfigFilePath?: string;
};

const OBJECT_METHOD_DENYLIST = new Set([
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
]);

export function extractApiSurfaceSchema(args: ExtractApiSurfaceArgs): ApiSurfaceSchema {
  const rootDir = args.rootDir ? path.resolve(args.rootDir) : process.cwd();
  const tsConfigFilePath = args.tsConfigFilePath ?? path.join(rootDir, "tsconfig.json");
  const entryPath = path.resolve(rootDir, args.entry);

  const project = new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: false });
  const sourceFile = project.getSourceFile(entryPath) ?? project.addSourceFileAtPath(entryPath);
  const exported = sourceFile.getExportedDeclarations().get(args.exportName)?.[0];
  if (!exported) throw new Error(`Export "${args.exportName}" was not found in ${entryPath}`);

  const type = exported.getType();
  const source = getSourceFromType(type);

  return {
    version: 1,
    entry: { filePath: entryPath, exportName: args.exportName },
    typeName: getTypeName(type, exported) ?? "unknown",
    source: source ?? {},
    properties: extractProperties(type, exported),
    methods: extractMethods(type, exported),
    devices: {},
  };
}

function extractProperties(type: Type, location: MorphNode): Record<string, PropertySchema> {
  try {
    const properties: Record<string, PropertySchema> = {};
    for (const property of safe(() => type.getProperties(), [] as Type["getProperties"] extends () => infer R ? R : never)) {
      const name = property.getName();
      if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
      const propertyType = property.getTypeAtLocation(location);
      if (safe(() => propertyType.getCallSignatures().length, 0) > 0) continue;
      properties[name] = {
        readonly: isReadonlySymbol(property),
        required: !property.isOptional(),
        type: resolveType(
          property.isOptional() ? stripUndefinedFromUnion(propertyType) : propertyType,
          location,
        ),
      };
    }
    return properties;
  } catch {
    return {};
  }
}

function extractMethods(type: Type, location: MorphNode): Record<string, MethodSchema> {
  try {
    const methods: Record<string, MethodSchema> = {};
    for (const property of safe(() => type.getProperties(), [] as Type["getProperties"] extends () => infer R ? R : never)) {
      const name = property.getName();
      if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
      const propertyType = property.getTypeAtLocation(location);
      if (safe(() => propertyType.getCallSignatures().length, 0) === 0) continue;
      methods[name] = extractMethod(propertyType, location);
    }
    return methods;
  } catch {
    return {};
  }
}

function extractMethod(type: Type, location: MorphNode): MethodSchema {
  try {
    const signature = safe(() => type.getCallSignatures()[0], undefined);
    if (!signature) return { params: [], returns: { kind: "unknown" } };
    const params: ParameterSchema[] = safe(() => signature.getParameters(), [] as ReturnType<typeof signature.getParameters>).map((parameter) => {
      const declaration = safe(() => parameter.getDeclarations()[0], undefined);
      const parameterType = safe(() => parameter.getTypeAtLocation(location), undefined);
      let required = true;
      let defaultValue: string | undefined;
      if (declaration && Node.isParameterDeclaration(declaration)) {
        required = !declaration.isOptional() && !declaration.hasInitializer();
        defaultValue = safe(() => declaration.getInitializer()?.getText(), undefined);
      }
      return {
        name: safe(() => parameter.getName(), "param"),
        required,
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        type: resolveType(
          parameterType ? (required ? parameterType : stripUndefinedFromUnion(parameterType)) : ("unknown" as unknown as Type),
          location,
        ),
      };
    });
    return { params, returns: resolveType(normalizeType(safe(() => signature.getReturnType(), type)), location) };
  } catch {
    return { params: [], returns: { kind: "unknown" } };
  }
}

function resolveType(type: Type, location: MorphNode, seen: Set<Type> = new Set()): TypeSchema {
  try {
    if (seen.has(type)) return { kind: "reference", name: getTypeName(type, location) ?? "unknown" };
    const resolved = normalizeType(type);
    const typeName = getTypeName(resolved, location);
    if (seen.has(resolved)) return { kind: "reference", name: typeName ?? "unknown" };
    if (safe(() => resolved.isNull(), false)) return { kind: "primitive", type: "null" };
    if (safe(() => resolved.isUndefined(), false)) return { kind: "primitive", type: "undefined" };
    if (safe(() => resolved.isStringLiteral(), false))
      return { kind: "literal", value: resolved.getLiteralValue() as string };
    if (safe(() => resolved.isNumberLiteral(), false)) return { kind: "literal", value: resolved.getLiteralValue() as number };
    if (safe(() => resolved.isBooleanLiteral(), false)) {
      const value = resolved.getLiteralValue();
      return { kind: "literal", value: typeof value === "boolean" ? value : false };
    }
    if (safe(() => resolved.isString(), false)) return { kind: "primitive", type: "string" };
    if (safe(() => resolved.isNumber(), false)) return { kind: "primitive", type: "number" };
    if (safe(() => resolved.isBoolean(), false)) return { kind: "primitive", type: "boolean" };
    if (safe(() => resolved.isBigInt(), false)) return { kind: "primitive", type: "bigint" };
    if (safe(() => resolved.isUnion(), false)) {
      const members = safe(() => resolved.getUnionTypes(), [])
        .filter((member) => !member.isUndefined())
        .map((member) => resolveType(normalizeType(member), location, new Set(seen)));
      if (
        members.length === 2 &&
        members.every((m) => m.kind === "literal" && typeof m.value === "boolean")
      )
        return { kind: "primitive", type: "boolean" };
      return { kind: "union", members };
    }
    if (safe(() => resolved.isTuple(), false))
      return {
        kind: "tuple",
        items: safe(() => resolved.getTupleElements(), [] as ReturnType<typeof resolved.getTupleElements>).map((item) => resolveType(item, location, new Set(seen))),
      };
    if (safe(() => resolved.isArray(), false))
      return {
        kind: "array",
        items:
          safe(() => resolved.getArrayElementType(), undefined) ?
            resolveType(safe(() => resolved.getArrayElementType()!, type), location, new Set(seen))
          : { kind: "unknown" },
      };
    if (safe(() => resolved.getCallSignatures().length, 0) > 0)
      return { kind: "reference", name: typeName ?? "Function" };
    if (safe(() => resolved.isObject(), false)) {
      seen.add(resolved);
      const properties: Record<string, PropertySchema> = {};
      const methods: Record<string, MethodSchema> = {};
      const includeMethods = shouldExtractObjectMethods(resolved);
      for (const property of safe(() => resolved.getProperties(), [] as ReturnType<Type["getProperties"]>)) {
        const name = property.getName();
        if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
        const propertyType = property.getTypeAtLocation(location);
        if (includeMethods && safe(() => propertyType.getCallSignatures().length, 0) > 0) {
          methods[name] = extractMethod(propertyType, location);
          continue;
        }

        properties[name] = {
          readonly: isReadonlySymbol(property),
          required: !property.isOptional(),
          type: resolveType(
            property.isOptional() ? stripUndefinedFromUnion(propertyType) : propertyType,
            location,
            new Set(seen),
          ),
        };
      }
      if (Object.keys(properties).length > 0 || Object.keys(methods).length > 0)
        return {
          kind: "object",
          ...(typeName && typeName !== "__type" ? { name: typeName } : {}),
          properties,
          methods,
        };
    }
    if (typeName) return { kind: "reference", name: typeName };
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

function normalizeType(type: Type): Type {
  try {
    if (type.isUnion()) return unwrapUndefined(type);
    return unwrapUndefined(unwrapPromise(type));
  } catch {
    return type;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function unwrapPromise(type: Type): Type {
  try {
    const symbolName = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName();
    return symbolName === "Promise" ? (type.getTypeArguments()[0] ?? type) : type;
  } catch {
    return type;
  }
}

function unwrapUndefined(type: Type): Type {
  if (!type.isUnion()) return type;
  const members = type.getUnionTypes().filter((member) => !member.isUndefined());
  return members.length === 1 ? members[0] : type;
}

function stripUndefinedFromUnion(type: Type): Type {
  if (!type.isUnion()) return type;
  const members = type.getUnionTypes().filter((member) => !member.isUndefined());
  return members.length === 1 ? members[0] : type;
}

function getTypeName(type: Type, location: MorphNode): string | undefined {
  try {
    const symbolName = type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName();
    if (symbolName && !symbolName.startsWith("__")) return symbolName;
  } catch {
    return undefined;
  }
  return undefined;
}

function shouldExtractObjectMethods(type: Type): boolean {
  let symbol: Symbol | undefined;
  try {
    symbol = type.getAliasSymbol() ?? type.getSymbol();
  } catch {
    return false;
  }
  if (!symbol) return true;

  return !safe(
    () => symbol.getDeclarations().some((declaration) => Node.isClassDeclaration(declaration) || Node.isClassExpression(declaration)),
    true,
  );
}

function getSourceFromType(type: Type): SourceSchema | undefined {
  let symbol: Symbol | undefined;
  try {
    symbol = type.getAliasSymbol() ?? type.getSymbol();
  } catch {
    return undefined;
  }
  if (!symbol || symbol.getName().startsWith("__")) return undefined;
  return getSourceFromSymbol(symbol);
}

function getSourceFromSymbol(symbol: Symbol): SourceSchema | undefined {
  const declaration = symbol.getDeclarations()[0];
  if (!declaration) return undefined;
  return { filePath: declaration.getSourceFile().getFilePath(), symbolName: symbol.getName() };
}

function isReadonlySymbol(symbol: Symbol): boolean {
  return symbol.getDeclarations().some((declaration) => {
    if (Node.isPropertyDeclaration(declaration) || Node.isPropertySignature(declaration))
      return declaration.isReadonly();
    if (Node.isParameterDeclaration(declaration)) return declaration.isReadonly();
    return false;
  });
}

function isPublicSymbol(symbol: Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) return true;
  return declarations.every((declaration) => {
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isMethodDeclaration(declaration) ||
      Node.isGetAccessorDeclaration(declaration) ||
      Node.isSetAccessorDeclaration(declaration)
    ) {
      const scope = declaration.getScope();
      return scope === undefined || scope === "public";
    }
    return true;
  });
}
