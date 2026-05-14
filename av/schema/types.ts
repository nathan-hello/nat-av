import type Natav from "../natav";

export type PrimitiveType =
  | "string"
  | "number"
  | "boolean"
  | "bigint"
  | "null"
  | "undefined";

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

export type SocketSchema = {
  typeName?: string;
  source?: SourceSchema;
  properties: Record<string, PropertySchema>;
  methods: Record<string, MethodSchema>;
  events: Record<string, TypeSchema>;
};

export type DriverSchema = {
  name: string;
  driverName: string;
  typeName?: string;
  source?: SourceSchema;
  deps: string[];
  state: TypeSchema;
  methods: Record<string, MethodSchema>;
  socket: SocketSchema | null;
};

export type NatavSchema<N extends Natav = Natav> = {
  version: 1;
  entry: {
    filePath: string;
    exportName: string;
  };
  roots: string[];
  devices: Record<Natav.Names<N>, DriverSchema>;
};

export type NatavRpcCallParams<N extends Natav, Name extends Natav.Names<N>> = {
  [MethodName in keyof Natav.Api<N, Name>]: Natav.Api<N, Name>[MethodName] extends (
    ...args: infer Args
  ) => any ?
    {
      device: Name;
      method: MethodName;
      args: Args;
    }
  : never;
}[keyof Natav.Api<N, Name>];

type JsonRpcTransportSchema<N extends Natav> = {
  jsonrpc: "2.0";
  requests: {
    call: {
      method: "device.call";
      params: {
        [DeviceName in Natav.Names<N>]: {
          device: DeviceName;
          method: keyof Natav.Api<N, DeviceName>;
          args: string;
        };
      }[Natav.Names<N>];
    };
    dependents: {
      method: "device.dependents";
      params: {
        device: Natav.Names<N>;
      };
    };
  };
  notifications: {
    state: {
      method: "notification";
      type: "natav:state:update";
    };
    connected: {
      method: "notification";
      type: "natav:device:connected";
    };
    disconnected: {
      method: "notification";
      type: "natav:device:disconnected";
    };
  };
};

export type NatavJsonRpcBindings<N extends Natav = Natav> = {
  version: 1;
  format: "natav-jsonrpc-bindings";
  entry: NatavSchema["entry"];
  roots: NatavSchema["roots"];
  transport: JsonRpcTransportSchema<N>;
  devices: NatavSchema<N>["devices"];
};
