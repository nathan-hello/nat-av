export type PrimitiveType = "string" | "number" | "boolean" | "bigint" | "null" | "undefined";

export type TypeSchema =
  | { kind: "primitive"; type: PrimitiveType }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "array"; items: TypeSchema }
  | { kind: "tuple"; items: TypeSchema[] }
  | { kind: "union"; members: TypeSchema[] }
  | { kind: "object"; name?: string; properties: Record<string, PropertySchema> }
  | { kind: "reference"; name: string }
  | { kind: "unknown"; name?: string };

export type PropertySchema = {
  readonly: boolean;
  required: boolean;
  type: TypeSchema;
};

export type ParameterSchema = {
  name: string;
  required: boolean;
  defaultValue?: string;
  type: TypeSchema;
};

export type MethodSchema = {
  params: ParameterSchema[];
  returns: TypeSchema;
};

export type SourceSchema = {
  filePath?: string;
  symbolName?: string;
};

export type ApiSurfaceSchema = {
  version: 1;
  entry: {
    filePath: string;
    exportName: string;
  };
  typeName: string;
  source: SourceSchema;
  properties: Record<string, PropertySchema>;
  methods: Record<string, MethodSchema>;
  devices: Record<string, unknown>;
};
