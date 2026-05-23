import type { Driver } from "./driver";

export type Protocols = "tcp" | "udp" | "ssh" | "telnet" | "http" | "mock";

export type DriverEvents<StateData = any> = {
  "driver:state-updated": Partial<StateData>;
  "driver:delimited": Buffer;
  "socket:bubbled": SocketEventMap;
};

export type ParsedData<T = any> = {
  data: T;
  raw: Buffer;
  timestamp: Date;
};

export type WriteResult = {
  bytesWritten: number;
};

export type SocketEventMap = {
  connected: void;
  disconnected: { error: string | undefined };
  receive: Buffer;
  error: { error: string; code?: string | number };
  transmit: { bytesWritten: number };
};

export interface DeviceSocket {
  start(): Promise<void> | void;
  end(): Promise<void> | void;
  write(data: string | Uint8Array | Buffer): Promise<number> | number;
  on<K extends keyof SocketEventMap>(
    event: K,
    handler: (payload: SocketEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  name: string;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

type DepMapOf<D extends Driver> = D["deps"];

type DepUnion<Deps> =
  IsAny<Deps> extends true ? never
  : Deps extends Record<string, infer Dep> ? Dep
  : never;

type DriverTree<D> =
  D extends Driver ? D | DriverTree<Extract<DepUnion<DepMapOf<D>>, Driver>>
  : never;

type DriversOf<C extends readonly Driver[]> = DriverTree<C[number]>;

export type NamesOf<C extends readonly Driver[]> = DriversOf<C>["name"];

export type DriverFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
> = Extract<DriversOf<C>, { name: N }>;

export type StateFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
> = DriverFor<C, N>["state"];

export type ApiFor<C extends readonly Driver[], N extends NamesOf<C>> = {
  [M in keyof DriverFor<C, N>["api"]]: DriverFor<C, N>["api"][M] extends (
    (...args: infer Args) => infer R
  ) ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

export type DepsOf<
  C extends readonly Driver[],
  N extends NamesOf<C>,
> = DriverFor<C, N>["deps"];

export type DepNamesOf<C extends readonly Driver[], N extends NamesOf<C>> =
  IsAny<DepsOf<C, N>> extends true ? never : keyof DepsOf<C, N> & string;

export type DepFor<
  C extends readonly Driver[],
  N extends NamesOf<C>,
  DN extends DepNamesOf<C, N>,
> = Extract<DepsOf<C, N>[DN], Driver>;

type PromisifyApi<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer Args) => infer R ?
    (...args: Args) => Promise<Awaited<R>>
  : never;
};

type DepNames<Deps> = IsAny<Deps> extends true ? never : keyof Deps & string;

export type DriverHandle<D extends Driver<any, any>> = {
  api: PromisifyApi<D["api"]>;
  state: D["state"];
} & DriverDepMixin<D["deps"]>;

type DriverDepMixin<Deps> =
  [DepNames<Deps>] extends [never] ? {}
  : {
      dep: <DN extends DepNames<Deps>>(
        depName: DN,
      ) => DriverHandle<Extract<Deps[DN], Driver>>;
    };

// Driver.schema types. Use Schema<this.api>.

type ApiMethod = (...args: any[]) => any;
export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };

type PrimitiveName<T> =
  [T] extends [string] ? "string"
  : [T] extends [number] ? "number"
  : [T] extends [boolean] ? "boolean"
  : [T] extends [null] ? "null"
  : [T] extends [undefined | void] ? "undefined"
  : "any";

type IsUnion<T, U = T> =
  [T] extends [boolean] ? false
  : T extends any ?
    [U] extends [T] ?
      false
    : true
  : never;

type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I
  : never;

type LastOfUnion<U> =
  UnionToIntersection<U extends any ? (x: U) => void : never> extends (
    (x: infer L) => void
  ) ?
    L
  : never;

type UnionToTuple<T, L = LastOfUnion<T>> =
  [T] extends [never] ? [] : readonly [...UnionToTuple<Exclude<T, L>>, L];

type WithoutUndefined<T> = Exclude<T, undefined>;

type WithOptional<S> = S & {
  readonly optional: true;
};

type IsOptionalKey<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

type TupleOptionalKeys<T extends readonly any[]> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

export type ReturnWire<T> =
  [Awaited<T>] extends [undefined | void] ? null : Awaited<T>;

type LiteralValue = string | number | boolean | null;

type IsLiteral<T> =
  [T] extends [LiteralValue] ?
    string extends T ? false
    : number extends T ? false
    : boolean extends T ? false
    : true
  : false;

type PrimitiveSchema<T> = {
  readonly type: PrimitiveName<T>;
};

type LiteralSchema<T> = {
  readonly type: "literal";
  readonly value: T;
};

type UnionSchema<T> = {
  readonly type: "union";
  readonly anyOf: SchemaFromUnion<T>;
};

type ArraySchema<T> = {
  readonly type: "array";
  readonly items: readonly [SchemaOf<T>];
};

type TupleSchema<T extends readonly any[]> = {
  readonly type: "tuple";
  readonly items: SchemaFromTuple<T>;
};

type ObjectSchema<T> = {
  readonly type: "object";
  readonly fields: ObjectFields<T>;
};

export type SchemaNode =
  | PrimitiveSchema<any>
  | LiteralSchema<any>
  | UnionSchema<any>
  | ArraySchema<any>
  | TupleSchema<readonly any[]>
  | ObjectSchema<any>;

type SchemaKind<T> =
  IsUnion<T> extends true ? "union"
  : IsLiteral<T> extends true ? "literal"
  : [T] extends [readonly any[]] ?
    number extends T["length"] ?
      "array"
    : "tuple"
  : [T] extends [object] ? "object"
  : "primitive";

export type SchemaMap<T> = {
  readonly union: UnionSchema<T>;
  readonly literal: LiteralSchema<T>;
  readonly array: [T] extends [readonly (infer U)[]] ? ArraySchema<U> : never;
  readonly tuple: [T] extends [readonly any[]] ? TupleSchema<T> : never;
  readonly object: ObjectSchema<T>;
  readonly primitive: PrimitiveSchema<T>;
};

type SchemaOf<T> = SchemaMap<T>[SchemaKind<T>];

type SchemaFromUnion<T> = UnionToTuple<T extends any ? SchemaOf<T> : never>;

type SchemaOfOptional<T> = WithOptional<SchemaOf<WithoutUndefined<T>>>;

type SchemaOfObjectProperty<T, K extends keyof T> =
  IsOptionalKey<T, K> extends true ? SchemaOfOptional<T[K]> : SchemaOf<T[K]>;

type SchemaOfTupleElement<T extends readonly any[], K extends keyof T> =
  K extends TupleOptionalKeys<T> ? SchemaOfOptional<T[K]> : SchemaOf<T[K]>;

type SchemaFromTuple<T extends readonly any[]> = {
  readonly [K in keyof T]: SchemaOfTupleElement<T, K>;
};

type ObjectField<T> = {
  readonly [K in keyof T & string]: {
    readonly name: K;
    readonly value: SchemaOfObjectProperty<T, K>;
  };
}[keyof T & string];

type Permutation<T, U = T> =
  [T] extends [never] ? readonly []
  : T extends T ? readonly [T, ...Permutation<Exclude<U, T>>]
  : never;

type ObjectFields<T> = Permutation<ObjectField<T>>;

type PrimitiveUi<T> = {
  readonly label?: string;
  readonly placeholder?: string;
  readonly widget?:
    | "textarea"
    | "password"
    | "text"
    | "slider"
    | "radio"
    | "dropdown";
  readonly options?: readonly T[];
  readonly defaultValue?: T;
};

type ObjectUi<T> = {
  readonly label?: string;
  readonly fields?: {
    readonly [K in keyof T & string]?: UiOf<T[K]>;
  };
};

type ArrayUi = {
  readonly label?: string;
  readonly collapsible?: boolean;
};

type UiKind<T> =
  [T] extends [readonly any[]] ? "array"
  : [T] extends [object] ? "object"
  : "primitive";

type UiMap<T> = {
  readonly array: ArrayUi;
  readonly object: ObjectUi<T>;
  readonly primitive: PrimitiveUi<T>;
};

type UiOf<T> = UiMap<T>[UiKind<T>];

type ArgsUi<T extends readonly any[]> = {
  readonly [K in keyof T]: UiOf<T[K]>;
} & {
  readonly length: T["length"];
};

type ApiEndpoint<Name extends string, Fn extends ApiMethod> = {
  readonly name: Name;

  // Source API return type, after Promise resolution and JSON wire coercion.
  // undefined/void return values are represented as null over the wire.
  readonly returns: SchemaOf<ReturnWire<ReturnType<Fn>>>;

  // Source API argument types.
  // null and undefined remain distinct here. A parameter expecting undefined
  // should be decoded from wire null by the transport layer, not by pretending
  // the API parameter type is null.
  readonly args: SchemaFromTuple<Parameters<Fn>>;

  readonly ui?: ArgsUi<Parameters<Fn>>;
};

type ApiBranch<Name extends string, T extends ApiRecord> = {
  readonly name: Name;
  readonly children: Schema<T>;
};

type ApiSchemaNode<Name extends string, T> =
  T extends ApiMethod ? ApiEndpoint<Name, T>
  : T extends ApiRecord ? ApiBranch<Name, T>
  : never;

export type Schema<T> =
  T extends ApiRecord ?
    ReadonlyArray<
      {
        readonly [K in keyof T & string]: ApiSchemaNode<K, T[K]>;
      }[keyof T & string]
    >
  : T extends { api: ApiRecord } ?
    ReadonlyArray<
      {
        readonly [K in keyof T["api"] & string]: ApiSchemaNode<K, T["api"][K]>;
      }[keyof T["api"] & string]
    >
  : never;
