import path from "node:path";

import { Node, Project, type Node as MorphNode, type Symbol, type Type } from "ts-morph";

import type { ApiSurfaceSchema, MethodSchema, ParameterSchema, PropertySchema, SourceSchema, TypeSchema } from "./types.ts";

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
    typeName: getTypeName(type, exported),
    source,
    properties: extractProperties(type, exported),
    methods: extractMethods(type, exported),
  };
}

function extractProperties(type: Type, location: MorphNode): Record<string, PropertySchema> {
  const properties: Record<string, PropertySchema> = {};
  for (const property of type.getProperties()) {
    const name = property.getName();
    if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
    const propertyType = property.getTypeAtLocation(location);
    if (propertyType.getCallSignatures().length > 0) continue;
    properties[name] = {
      readonly: isReadonlySymbol(property),
      required: !property.isOptional(),
      type: resolveType(property.isOptional() ? stripUndefinedFromUnion(propertyType) : propertyType, location),
    };
  }
  return properties;
}

function extractMethods(type: Type, location: MorphNode): Record<string, MethodSchema> {
  const methods: Record<string, MethodSchema> = {};
  for (const property of type.getProperties()) {
    const name = property.getName();
    if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
    const propertyType = property.getTypeAtLocation(location);
    if (propertyType.getCallSignatures().length === 0) continue;
    methods[name] = extractMethod(propertyType, location);
  }
  return methods;
}

function extractMethod(type: Type, location: MorphNode): MethodSchema {
  const signature = type.getCallSignatures()[0];
  if (!signature) return { params: [], returns: { kind: "unknown" } };
  const params: ParameterSchema[] = signature.getParameters().map((parameter) => {
    const declaration = parameter.getDeclarations()[0];
    const parameterType = parameter.getTypeAtLocation(location);
    let required = true;
    let defaultValue: string | undefined;
    if (declaration && Node.isParameterDeclaration(declaration)) {
      required = !declaration.isOptional() && !declaration.hasInitializer();
      defaultValue = declaration.getInitializer()?.getText();
    }
    return {
      name: parameter.getName(),
      required,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      type: resolveType(required ? parameterType : stripUndefinedFromUnion(parameterType), location),
    };
  });
  return { params, returns: resolveType(normalizeType(signature.getReturnType()), location) };
}

function resolveType(type: Type, location: MorphNode, seen: Set<string> = new Set()): TypeSchema {
  const resolved = normalizeType(type);
  const typeId = getTypeId(resolved, location);
  if (seen.has(typeId)) return { kind: "reference", name: getTypeName(resolved, location) ?? typeId };
  if (resolved.isNull()) return { kind: "primitive", type: "null" };
  if (resolved.isUndefined()) return { kind: "primitive", type: "undefined" };
  if (resolved.isStringLiteral()) return { kind: "literal", value: resolved.getLiteralValue() as string };
  if (resolved.isNumberLiteral()) return { kind: "literal", value: resolved.getLiteralValue() as number };
  if (resolved.isBooleanLiteral()) return { kind: "literal", value: resolved.getText() === "true" };
  if (resolved.isString()) return { kind: "primitive", type: "string" };
  if (resolved.isNumber()) return { kind: "primitive", type: "number" };
  if (resolved.isBoolean()) return { kind: "primitive", type: "boolean" };
  if (resolved.isBigInt()) return { kind: "primitive", type: "bigint" };
  const typeName = getTypeName(resolved, location);
  if (resolved.isUnion()) {
    const members = resolved.getUnionTypes().filter((member) => !member.isUndefined()).map((member) => resolveType(normalizeType(member), location, new Set(seen)));
    if (members.length === 2 && members.every((m) => m.kind === "literal" && typeof m.value === "boolean")) return { kind: "primitive", type: "boolean" };
    return { kind: "union", members };
  }
  if (resolved.isTuple()) return { kind: "tuple", items: resolved.getTupleElements().map((item) => resolveType(item, location, new Set(seen))) };
  if (resolved.isArray()) return { kind: "array", items: resolved.getArrayElementType() ? resolveType(resolved.getArrayElementType()!, location, new Set(seen)) : { kind: "unknown" } };
  if (resolved.getCallSignatures().length > 0) return { kind: "reference", name: typeName ?? "Function" };
  if (resolved.isObject()) {
    seen.add(typeId);
    const properties: Record<string, PropertySchema> = {};
    for (const property of resolved.getProperties()) {
      const name = property.getName();
      if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) continue;
      const propertyType = property.getTypeAtLocation(location);
      if (propertyType.getCallSignatures().length > 0) continue;
      properties[name] = { readonly: isReadonlySymbol(property), required: !property.isOptional(), type: resolveType(property.isOptional() ? stripUndefinedFromUnion(propertyType) : propertyType, location, new Set(seen)) };
    }
    if (Object.keys(properties).length > 0) return { kind: "object", ...(typeName && typeName !== "__type" ? { name: typeName } : {}), properties };
  }
  if (typeName) return { kind: "reference", name: typeName };
  return { kind: "unknown" };
}

function normalizeType(type: Type): Type {
  if (type.isUnion()) return unwrapUndefined(type);
  return unwrapUndefined(unwrapPromise(type));
}

function unwrapPromise(type: Type): Type {
  const symbolName = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName();
  return symbolName === "Promise" ? type.getTypeArguments()[0] ?? type : type;
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
  const symbolName = type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName();
  if (symbolName && !symbolName.startsWith("__")) return symbolName;
  return sanitizeTypeText(type.getText(location));
}

function sanitizeTypeText(text: string): string | undefined {
  const normalized = text.replace(/import\([^)]*\)\./g, "").trim();
  if (!normalized || normalized.startsWith("{") || normalized.startsWith("(") || normalized.includes("=>") || normalized.startsWith("readonly {")) return undefined;
  return normalized;
}

function getTypeId(type: Type, location: MorphNode) {
  return `${getTypeName(type, location) ?? "unknown"}:${type.getText(location)}`;
}

function getSourceFromType(type: Type): SourceSchema | undefined {
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
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
    if (Node.isPropertyDeclaration(declaration) || Node.isPropertySignature(declaration)) return declaration.isReadonly();
    if (Node.isParameterDeclaration(declaration)) return declaration.isReadonly();
    return false;
  });
}

function isPublicSymbol(symbol: Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) return true;
  return declarations.every((declaration) => {
    if (Node.isPropertyDeclaration(declaration) || Node.isMethodDeclaration(declaration) || Node.isGetAccessorDeclaration(declaration) || Node.isSetAccessorDeclaration(declaration)) {
      const scope = declaration.getScope();
      return scope === undefined || scope === "public";
    }
    return true;
  });
}
