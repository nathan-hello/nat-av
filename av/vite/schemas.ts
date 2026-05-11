import { Project, Node, type Type } from "ts-morph";
import type { Plugin, ViteDevServer } from "vite";
import path from "path";

type TypeSchema =
  | { kind: "primitive"; type: "string" | "number" | "boolean" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "object"; properties: Record<string, { required: boolean; type: TypeSchema }> }
  | { kind: "array"; items: TypeSchema }
  | { kind: "union"; members: TypeSchema[] }
  | { kind: "unknown" };

type ParamSchema = {
  name: string;
  required: boolean;
  defaultValue?: string;
  type: TypeSchema;
};

type MethodSchema = {
  params: ParamSchema[];
};

type DriverSchema = {
  methods: Record<string, MethodSchema>;
  deps: string[];
};

type DriverSchemas = Record<string, DriverSchema>;

const VIRTUAL_MODULE_ID = "virtual:natav-schemas";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

export default function VitePluginDriverSchemas(): Plugin {
  let project: Project;
  let currentSchemas: DriverSchemas = {};
  let watchedFiles = new Set<string>();
  let rootDir: string;
  let server: ViteDevServer | undefined;

  function extract() {
    for (const file of project.getSourceFiles()) {
      file.refreshFromFileSystemSync();
    }

    const schemas: DriverSchemas = {};
    const watched = new Set<string>();

    const indexFile = project.getSourceFile(path.join(rootDir, "server/index.ts"));
    if (!indexFile) return;
    watched.add(indexFile.getFilePath());

    // Collect all NewExpression nodes that produce a BaseDriver subclass.
    // We identify them by checking the resulting type for `_drivername` and `api` —
    // properties unique to BaseDriver. The type checker resolves generics,
    // so we get concrete types like Decoder<"decoder-1"> with the name as
    // a string literal.
    type DriverInstance = {
      node: Node;
      name: string;
    };
    const instances: DriverInstance[] = [];

    indexFile.forEachDescendant((node) => {
      if (!Node.isNewExpression(node)) return;

      const nodeType = node.getType();

      // Must have _drivername (BaseDriver-specific) and api
      const driverNameProp = nodeType.getProperty("_drivername");
      const apiProp = nodeType.getProperty("api");
      if (!driverNameProp || !apiProp) return;

      // Get the instance name from the string literal type of `name`
      const nameProp = nodeType.getProperty("name");
      if (!nameProp) return;
      const nameType = nameProp.getTypeAtLocation(node);
      if (!nameType.isStringLiteral()) return;
      const instanceName = nameType.getLiteralValue() as string;

      // Track the driver class source file for HMR
      const symbol = nodeType.getSymbol();
      if (symbol) {
        for (const decl of symbol.getDeclarations()) {
          watched.add(decl.getSourceFile().getFilePath());
        }
      }

      // Extract API schema from the type
      const apiType = apiProp.getTypeAtLocation(node);
      const methods: Record<string, MethodSchema> = {};

      for (const methodSymbol of apiType.getProperties()) {
        const methodType = methodSymbol.getTypeAtLocation(node);
        const callSigs = methodType.getCallSignatures();
        if (callSigs.length === 0) continue;

        const sig = callSigs[0];
        const params: ParamSchema[] = [];

        for (const paramSymbol of sig.getParameters()) {
          const paramType = paramSymbol.getTypeAtLocation(node);
          const paramDecls = paramSymbol.getDeclarations();
          const paramDecl = paramDecls[0];

          let isOptional = false;
          let defaultValue: string | undefined;

          if (paramDecl && Node.isParameterDeclaration(paramDecl)) {
            isOptional = paramDecl.isOptional() || paramDecl.hasInitializer();
            defaultValue = paramDecl.getInitializer()?.getText();
          }

          // Track param type source files for HMR
          trackTypeFiles(paramType, watched);

          // Unwrap optional param type (remove undefined from union)
          let resolved: TypeSchema;
          if (isOptional && paramType.isUnion()) {
            const nonUndefined = paramType.getUnionTypes().filter((t) => !t.isUndefined());
            if (nonUndefined.length === 1) {
              resolved = resolveType(nonUndefined[0]);
            } else if (nonUndefined.length > 1) {
              resolved = { kind: "union", members: nonUndefined.map((t) => resolveType(t)) };
            } else {
              resolved = { kind: "unknown" };
            }
          } else {
            resolved = resolveType(paramType);
          }

          params.push({
            name: paramSymbol.getName(),
            required: !isOptional,
            ...(defaultValue !== undefined ? { defaultValue } : {}),
            type: resolved,
          });
        }

        methods[methodSymbol.getName()] = { params };
      }

      schemas[instanceName] = { methods, deps: [] };
      instances.push({ node, name: instanceName });
    });

    // Build dep tree from AST nesting. For each child driver, walk up the
    // AST to find the nearest parent driver — that's its direct owner.
    for (const child of instances) {
      let current = child.node.getParent();
      while (current) {
        const parent = instances.find((i) => i !== child && i.node === current);
        if (parent) {
          schemas[parent.name].deps.push(child.name);
          break;
        }
        current = current.getParent();
      }
    }

    currentSchemas = schemas;
    watchedFiles = watched;
  }

  return {
    name: "driver-schemas",
    enforce: "pre",

    configResolved(config) {
      rootDir = config.root;
    },

    buildStart() {
      project = new Project({
        tsConfigFilePath: path.join(rootDir, "tsconfig.json"),
        skipAddingFilesFromTsConfig: false,
      });
      extract();
    },

    configureServer(dev) {
      server = dev;
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return `export default ${JSON.stringify(currentSchemas, null, 2)};`;
      }
    },

    handleHotUpdate({ file }) {
      if (!watchedFiles.has(file)) return;

      extract();

      const mod = server?.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
      if (mod) {
        server?.moduleGraph.invalidateModule(mod);
        server?.ws.send({ type: "full-reload" });
      }
    },
  };
}

function trackTypeFiles(type: Type, watched: Set<string>) {
  const sym = type.getSymbol() || type.getAliasSymbol();
  if (sym) {
    for (const decl of sym.getDeclarations()) {
      watched.add(decl.getSourceFile().getFilePath());
    }
  }
  if (type.isUnion()) {
    for (const t of type.getUnionTypes()) {
      trackTypeFiles(t, watched);
    }
  }
}

function resolveType(type: Type, seen: Set<string> = new Set()): TypeSchema {
  const typeId = type.getText();
  if (seen.has(typeId)) return { kind: "unknown" };

  // Literal types
  if (type.isStringLiteral()) return { kind: "literal", value: type.getLiteralValue() as string };
  if (type.isNumberLiteral()) return { kind: "literal", value: type.getLiteralValue() as number };
  if (type.isBooleanLiteral()) return { kind: "literal", value: type.getText() === "true" };

  // Primitives
  if (type.isString()) return { kind: "primitive", type: "string" };
  if (type.isNumber()) return { kind: "primitive", type: "number" };
  if (type.isBoolean()) return { kind: "primitive", type: "boolean" };

  // Union types
  if (type.isUnion()) {
    const members = type.getUnionTypes().map((t) => resolveType(t, new Set(seen)));
    if (
      members.length === 2 &&
      members.every((m) => m.kind === "literal" && typeof m.value === "boolean")
    ) {
      return { kind: "primitive", type: "boolean" };
    }
    return { kind: "union", members };
  }

  // Arrays
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return { kind: "array", items: resolveType(elementType, new Set(seen)) };
  }

  // Object types
  if (type.isObject() && !type.isArray()) {
    const callSignatures = type.getCallSignatures();
    if (callSignatures.length > 0) return { kind: "unknown" };

    const symbol = type.getSymbol() || type.getAliasSymbol();
    const symbolName = symbol?.getName();

    if (symbolName === "Promise" || symbolName === "Date" || symbolName === "RegExp") {
      return { kind: "unknown" };
    }

    seen.add(typeId);

    const properties: Record<string, { required: boolean; type: TypeSchema }> = {};
    for (const prop of type.getProperties()) {
      const propType = prop.getValueDeclarationOrThrow().getType();
      const isOptional = prop.isOptional();

      let resolved: TypeSchema;
      if (isOptional && propType.isUnion()) {
        const nonUndefined = propType.getUnionTypes().filter((t) => !t.isUndefined());
        if (nonUndefined.length === 1) {
          resolved = resolveType(nonUndefined[0], new Set(seen));
        } else if (nonUndefined.length > 1) {
          resolved = {
            kind: "union",
            members: nonUndefined.map((t) => resolveType(t, new Set(seen))),
          };
        } else {
          resolved = { kind: "unknown" };
        }
      } else {
        resolved = resolveType(propType, new Set(seen));
      }

      properties[prop.getName()] = { required: !isOptional, type: resolved };
    }

    return { kind: "object", properties };
  }

  return { kind: "unknown" };
}
