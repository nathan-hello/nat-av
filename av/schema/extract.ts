import path from "node:path";

import {
  Node,
  Project,
  type ConstructorDeclaration,
  type ClassDeclaration,
  type Expression,
  type NewExpression,
  type Node as MorphNode,
  type Symbol,
  type Type,
} from "ts-morph";

import type {
  DriverSchema,
  MethodSchema,
  NatavSchema,
  ParameterSchema,
  PropertySchema,
  SocketSchema,
  SourceSchema,
  TypeSchema,
} from "./types.ts";

type ExtractNatavSchemaArgs = {
  entry: string;
  exportName?: string;
  rootDir?: string;
  tsConfigFilePath?: string;
};

const BUILTIN_REFERENCE_TYPES = new Set([
  "AbortSignal",
  "ArrayBuffer",
  "Blob",
  "Buffer",
  "Date",
  "Event",
  "EventTarget",
  "Headers",
  "Map",
  "Promise",
  "RegExp",
  "Request",
  "Response",
  "Set",
  "Uint8Array",
  "URL",
  "WeakMap",
  "WeakSet",
]);

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

const EVENT_TARGET_METHOD_DENYLIST = new Set([
  "addEventListener",
  "dispatch",
  "dispatchEvent",
  "removeEventListener",
]);

export function extractNatavSchema(args: ExtractNatavSchemaArgs): NatavSchema {
  let rootDir = args.rootDir ? path.resolve(args.rootDir) : process.cwd();
  let tsConfigFilePath = args.tsConfigFilePath ?? path.join(rootDir, "tsconfig.json");
  let entryPath = path.resolve(rootDir, args.entry);
  let exportName = args.exportName ?? "natav";

  let project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: false,
  });

  let sourceFile = project.getSourceFile(entryPath) ?? project.addSourceFileAtPath(entryPath);
  let exported = sourceFile.getExportedDeclarations().get(exportName)?.[0];
  if (!exported) {
    throw new Error(`Export \"${exportName}\" was not found in ${entryPath}`);
  }

  let natavExpression = resolveNatavExpression(exported);
  if (!natavExpression) {
    throw new Error(`Export \"${exportName}\" in ${entryPath} is not a Natav instance`);
  }

  let configArg = natavExpression.getArguments()[0];
  if (!configArg || !Node.isArrayLiteralExpression(configArg)) {
    throw new Error(`Natav export \"${exportName}\" must be initialized with an array literal`);
  }

  let devices = new Map<string, DriverSchema>();
  let roots: string[] = [];
  let seenNodes = new Set<string>();

  for (let element of configArg.getElements()) {
    if (!Node.isExpression(element)) {
      continue;
    }

    let driverExpression = resolveDriverExpression(element);
    if (!driverExpression) {
      continue;
    }

    roots.push(extractDriver(driverExpression, devices, seenNodes));
  }

  return {
    version: 1,
    entry: {
      filePath: entryPath,
      exportName,
    },
    roots,
    devices: Object.fromEntries(
      Array.from(devices.entries()).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function extractDriver(
  node: NewExpression,
  devices: Map<string, DriverSchema>,
  seenNodes: Set<string>,
): string {
  let nodeId = getNodeId(node);
  if (seenNodes.has(nodeId)) {
    return extractLiteralProperty(node.getType(), node, "name") ?? nodeId;
  }
  seenNodes.add(nodeId);

  let driverType = node.getType();
  let name = extractLiteralProperty(driverType, node, "name");
  if (!name) {
    throw new Error(
      `Driver at ${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()} is missing a literal name`,
    );
  }

  let deps = extractDirectDriverDependencies(node).map((dependency) =>
    extractDriver(dependency, devices, seenNodes),
  );

  let apiType = getPropertyType(driverType, node, "api");
  let stateType = getPropertyType(driverType, node, "state");
  let socketType = getPropertyType(driverType, node, "socket");
  let socketNode = findConcreteSocketExpression(node);

  devices.set(name, {
    name,
    driverName: extractDriverName(node, driverType),
    typeName: getTypeName(driverType, node),
    source: getSourceFromType(driverType),
    deps,
    state: stateType ? resolveType(unwrapUndefined(stateType), node) : { kind: "unknown" },
    methods: apiType ? extractMethods(apiType, node) : {},
    socket: buildSocketSchema(socketNode ?? node, socketNode?.getType() ?? socketType),
  });

  return name;
}

function buildSocketSchema(location: MorphNode, socketType: Type | undefined): SocketSchema | null {
  if (!socketType) {
    return null;
  }

  let resolvedType = unwrapUndefined(socketType);
  if (resolvedType.isUndefined()) {
    return null;
  }

  let methods: Record<string, MethodSchema> = {};
  let properties: Record<string, PropertySchema> = {};

  for (let property of resolvedType.getProperties()) {
    let name = property.getName();
    if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name) || EVENT_TARGET_METHOD_DENYLIST.has(name)) {
      continue;
    }

    let propertyType = property.getTypeAtLocation(location);
    if (propertyType.getCallSignatures().length > 0) {
      methods[name] = extractMethod(propertyType, location);
      continue;
    }

    properties[name] = {
      readonly: isReadonlySymbol(property),
      required: !property.isOptional(),
      type: resolveType(unwrapUndefined(propertyType), location),
    };
  }

  return {
    typeName: getTypeName(resolvedType, location),
    source: getSourceFromType(resolvedType),
    properties,
    methods,
    events: extractEventMap(resolvedType, location),
  };
}

function extractMethods(type: Type, location: MorphNode): Record<string, MethodSchema> {
  let methods: Record<string, MethodSchema> = {};

  for (let property of type.getProperties()) {
    let propertyType = property.getTypeAtLocation(location);
    if (propertyType.getCallSignatures().length === 0) {
      continue;
    }

    methods[property.getName()] = extractMethod(propertyType, location);
  }

  return methods;
}

function extractMethod(type: Type, location: MorphNode): MethodSchema {
  let signature = type.getCallSignatures()[0];
  if (!signature) {
    return { params: [], returns: { kind: "unknown" } };
  }

  let params: ParameterSchema[] = signature.getParameters().map((parameter) => {
    let declaration = parameter.getDeclarations()[0];
    let parameterType = parameter.getTypeAtLocation(location);
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

  return {
    params,
    returns: resolveType(normalizeType(signature.getReturnType()), location),
  };
}

function resolveType(type: Type, location: MorphNode, seen: Set<string> = new Set()): TypeSchema {
  let resolved = normalizeType(type);
  let typeId = getTypeId(resolved, location);
  if (seen.has(typeId)) {
    return { kind: "reference", name: getTypeName(resolved, location) ?? typeId };
  }

  if (resolved.isNull()) {
    return { kind: "primitive", type: "null" };
  }

  if (resolved.isUndefined()) {
    return { kind: "primitive", type: "undefined" };
  }

  if (resolved.isStringLiteral()) {
    return { kind: "literal", value: resolved.getLiteralValue() as string };
  }

  if (resolved.isNumberLiteral()) {
    return { kind: "literal", value: resolved.getLiteralValue() as number };
  }

  if (resolved.isBooleanLiteral()) {
    return { kind: "literal", value: resolved.getText() === "true" };
  }

  if (resolved.isString()) {
    return { kind: "primitive", type: "string" };
  }

  if (resolved.isNumber()) {
    return { kind: "primitive", type: "number" };
  }

  if (resolved.isBoolean()) {
    return { kind: "primitive", type: "boolean" };
  }

  if (resolved.isBigInt()) {
    return { kind: "primitive", type: "bigint" };
  }

  let typeName = getTypeName(resolved, location);
  if (typeName && BUILTIN_REFERENCE_TYPES.has(typeName)) {
    return { kind: "reference", name: typeName };
  }

  if (resolved.isUnion()) {
    let members = resolved
      .getUnionTypes()
      .filter((member) => !member.isUndefined())
      .map((member) => resolveType(normalizeType(member), location, new Set(seen)));

    if (
      members.length === 2 &&
      members.every((member) => member.kind === "literal" && typeof member.value === "boolean")
    ) {
      return { kind: "primitive", type: "boolean" };
    }

    return { kind: "union", members };
  }

  if (resolved.isTuple()) {
    return {
      kind: "tuple",
      items: resolved.getTupleElements().map((item) => resolveType(item, location, new Set(seen))),
    };
  }

  if (resolved.isArray()) {
    let elementType = resolved.getArrayElementType();
    return {
      kind: "array",
      items: elementType ? resolveType(elementType, location, new Set(seen)) : { kind: "unknown" },
    };
  }

  if (resolved.getCallSignatures().length > 0) {
    return { kind: "reference", name: typeName ?? "Function" };
  }

  if (resolved.isObject()) {
    if (typeName && BUILTIN_REFERENCE_TYPES.has(typeName)) {
      return { kind: "reference", name: typeName };
    }

    seen.add(typeId);

    let properties: Record<string, PropertySchema> = {};
    for (let property of resolved.getProperties()) {
      let name = property.getName();
      if (!isPublicSymbol(property) || OBJECT_METHOD_DENYLIST.has(name)) {
        continue;
      }

      let propertyType = property.getTypeAtLocation(location);
      if (propertyType.getCallSignatures().length > 0) {
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

    if (Object.keys(properties).length > 0) {
      return {
        kind: "object",
        ...(typeName && typeName !== "__type" ? { name: typeName } : {}),
        properties,
      };
    }
  }

  if (typeName) {
    return { kind: "reference", name: typeName };
  }

  return { kind: "unknown" };
}

function extractEventMap(type: Type, location: MorphNode): Record<string, TypeSchema> {
  let eventType = findEventMapType(type);
  if (!eventType) {
    return {};
  }

  let events: Record<string, TypeSchema> = {};
  for (let property of eventType.getProperties()) {
    let propertyType = property.getTypeAtLocation(location);
    events[property.getName()] = resolveType(unwrapUndefined(propertyType), location);
  }

  return events;
}

function findEventMapType(type: Type): Type | undefined {
  let symbol = type.getSymbol() ?? type.getAliasSymbol();
  if (!symbol) {
    return undefined;
  }

  for (let declaration of symbol.getDeclarations()) {
    if (!Node.isClassDeclaration(declaration)) {
      continue;
    }

    let eventType = findEventMapTypeFromClassDeclaration(declaration);
    if (eventType) {
      return eventType;
    }
  }

  return undefined;
}

function findEventMapTypeFromClassDeclaration(node: ClassDeclaration): Type | undefined {
  for (let heritage of node.getHeritageClauses()) {
    for (let typeNode of heritage.getTypeNodes()) {
      let baseName = typeNode.getExpression().getText();
      if (baseName.endsWith("TypedEventTarget") || baseName.endsWith("ProtectedTypedEventTarget")) {
        return typeNode.getTypeArguments()[0]?.getType();
      }

      let baseType = typeNode.getType();
      let baseSymbol = baseType.getSymbol() ?? baseType.getAliasSymbol();
      if (!baseSymbol) {
        continue;
      }

      for (let declaration of baseSymbol.getDeclarations()) {
        if (!Node.isClassDeclaration(declaration)) {
          continue;
        }

        let nested = findEventMapTypeFromClassDeclaration(declaration);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return undefined;
}

function extractDirectDriverDependencies(node: NewExpression): NewExpression[] {
  let dependencies = new Map<string, NewExpression>();

  for (let argument of node.getArguments()) {
    walkExpression(argument, (expression) => {
      let candidate = resolveDriverExpression(expression);
      if (!candidate || candidate === node) {
        return false;
      }

      dependencies.set(getNodeId(candidate), candidate);
      return true;
    });
  }

  return Array.from(dependencies.values());
}

function walkExpression(node: MorphNode, visit: (expression: Expression) => boolean) {
  for (let child of node.getChildren()) {
    if (Node.isExpression(child) && visit(child)) {
      continue;
    }

    walkExpression(child, visit);
  }
}

function findConcreteSocketExpression(node: NewExpression): Expression | undefined {
  let firstArg = node.getArguments()[0];
  if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) {
    return undefined;
  }

  for (let property of firstArg.getProperties()) {
    if (!Node.isPropertyAssignment(property) || property.getName() !== "socket") {
      continue;
    }

    return resolveExpression(property.getInitializer());
  }

  return undefined;
}

function resolveNatavExpression(node: MorphNode): NewExpression | undefined {
  let expression = resolveNodeExpression(node);
  if (!expression || !Node.isNewExpression(expression)) {
    return undefined;
  }

  return isNatavType(expression.getType()) ? expression : undefined;
}

function resolveDriverExpression(expression: Expression): NewExpression | undefined {
  let resolved = resolveExpression(expression);
  if (!resolved || !Node.isNewExpression(resolved)) {
    return undefined;
  }

  return isDriverType(resolved.getType()) ? resolved : undefined;
}

function resolveNodeExpression(node: MorphNode): Expression | undefined {
  if (Node.isVariableDeclaration(node)) {
    return resolveExpression(node.getInitializer());
  }

  if (Node.isExportAssignment(node)) {
    return resolveExpression(node.getExpression());
  }

  if (Node.isExpression(node)) {
    return resolveExpression(node);
  }

  return undefined;
}

function resolveExpression(expression: Expression | undefined): Expression | undefined {
  if (!expression) {
    return undefined;
  }

  let current = expression;
  while (true) {
    if (Node.isParenthesizedExpression(current)) {
      current = current.getExpression();
      continue;
    }

    if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) {
      current = current.getExpression();
      continue;
    }

    if (Node.isNonNullExpression(current)) {
      current = current.getExpression();
      continue;
    }

    if (Node.isIdentifier(current)) {
      let declaration = current.getDefinitions()[0]?.getDeclarationNode();
      if (!declaration || declaration === current) {
        return current;
      }

      let resolved = resolveNodeExpression(declaration);
      if (!resolved || resolved === current) {
        return current;
      }

      current = resolved;
      continue;
    }

    return current;
  }
}

function getPropertyType(type: Type, location: MorphNode, propertyName: string): Type | undefined {
  return type.getProperty(propertyName)?.getTypeAtLocation(location);
}

function extractLiteralProperty(type: Type, location: MorphNode, propertyName: string): string | undefined {
  let propertyType = getPropertyType(type, location, propertyName);
  if (!propertyType) {
    return undefined;
  }

  if (propertyType.isStringLiteral()) {
    return propertyType.getLiteralValue() as string;
  }

  return undefined;
}

function extractDriverName(node: NewExpression, type: Type): string {
  let fromType = extractLiteralProperty(type, node, "_drivername");
  if (fromType) {
    return fromType;
  }

  let declaration = getClassDeclarationFromType(type);
  if (!declaration) {
    return "unknown";
  }

  let fromConstructor = extractDriverNameFromConstructor(declaration.getConstructors()[0]);
  return fromConstructor ?? "unknown";
}

function extractDriverNameFromConstructor(constructor: ConstructorDeclaration | undefined) {
  if (!constructor) {
    return undefined;
  }

  for (let statement of constructor.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }

    let expression = statement.getExpression();
    if (!Node.isCallExpression(expression) || expression.getExpression().getText() !== "super") {
      continue;
    }

    let firstArg = expression.getArguments()[0];
    if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) {
      continue;
    }

    for (let property of firstArg.getProperties()) {
      if (!Node.isPropertyAssignment(property) || property.getName() !== "driverName") {
        continue;
      }

      let initializer = property.getInitializer();
      if (initializer && Node.isStringLiteral(initializer)) {
        return initializer.getLiteralText();
      }
    }
  }

  return undefined;
}

function isDriverType(type: Type): boolean {
  return Boolean(type.getProperty("_drivername") && type.getProperty("api") && type.getProperty("state"));
}

function isNatavType(type: Type): boolean {
  return Boolean(type.getProperty("configs") && type.getProperty("GetDriver") && type.getProperty("FindDriver"));
}

function unwrapPromise(type: Type): Type {
  let symbolName = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName();
  if (symbolName === "Promise") {
    return type.getTypeArguments()[0] ?? type;
  }

  return type;
}

function normalizeType(type: Type): Type {
  if (type.isUnion()) {
    return unwrapUndefined(type);
  }

  return unwrapUndefined(unwrapPromise(type));
}

function unwrapUndefined(type: Type): Type {
  if (!type.isUnion()) {
    return type;
  }

  let members = type.getUnionTypes().filter((member) => !member.isUndefined());
  if (members.length === 1) {
    return members[0];
  }

  return type;
}

function stripUndefinedFromUnion(type: Type): Type {
  if (!type.isUnion()) {
    return type;
  }

  let members = type.getUnionTypes().filter((member) => !member.isUndefined());
  if (members.length === 1) {
    return members[0];
  }

  return type;
}

function getTypeName(type: Type, location: MorphNode): string | undefined {
  let symbolName = type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName();
  if (symbolName && !symbolName.startsWith("__")) {
    return symbolName;
  }

  return sanitizeTypeText(type.getText(location));
}

function sanitizeTypeText(text: string): string | undefined {
  let normalized = text.replace(/import\([^)]*\)\./g, "").trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.startsWith("{") ||
    normalized.startsWith("(") ||
    normalized.includes("=>") ||
    normalized.startsWith("readonly {")
  ) {
    return undefined;
  }

  return normalized;
}

function getSourceFromType(type: Type): SourceSchema | undefined {
  let symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (!symbol) {
    return undefined;
  }

  if (symbol.getName().startsWith("__")) {
    return undefined;
  }

  return getSourceFromSymbol(symbol);
}

function getSourceFromSymbol(symbol: Symbol): SourceSchema | undefined {
  let declaration = symbol.getDeclarations()[0];
  if (!declaration) {
    return undefined;
  }

  return {
    filePath: declaration.getSourceFile().getFilePath(),
    symbolName: symbol.getName(),
  };
}

function isReadonlySymbol(symbol: Symbol): boolean {
  return symbol.getDeclarations().some((declaration) => {
    if (Node.isPropertyDeclaration(declaration) || Node.isPropertySignature(declaration)) {
      return declaration.isReadonly();
    }

    if (Node.isParameterDeclaration(declaration)) {
      return declaration.isReadonly();
    }

    return false;
  });
}

function isPublicSymbol(symbol: Symbol): boolean {
  let declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return true;
  }

  return declarations.every((declaration) => {
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isMethodDeclaration(declaration) ||
      Node.isGetAccessorDeclaration(declaration) ||
      Node.isSetAccessorDeclaration(declaration)
    ) {
      let scope = declaration.getScope();
      return scope === undefined || scope === "public";
    }

    return true;
  });
}

function getClassDeclarationFromType(type: Type): ClassDeclaration | undefined {
  let symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (!symbol) {
    return undefined;
  }

  for (let declaration of symbol.getDeclarations()) {
    if (Node.isClassDeclaration(declaration)) {
      return declaration;
    }
  }

  return undefined;
}

function getTypeId(type: Type, location: MorphNode): string {
  let source = getSourceFromType(type)?.filePath ?? "";
  return `${source}:${type.getText(location)}`;
}

function getNodeId(node: MorphNode): string {
  return `${node.getSourceFile().getFilePath()}:${node.getStart()}`;
}
