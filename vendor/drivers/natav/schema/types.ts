import type { Drivers } from "@av/index";

type PrimitiveName<T> =
  [T] extends [string] ? "string"
  : [T] extends [number] ? "number"
  : [T] extends [boolean] ? "boolean"
  : [T] extends [null] ? "null"
  : [T] extends [undefined | void] ? "undefined"
  : "any";

type IsUnion<T, U = T> =
  [T] extends [boolean] ? false
  : T extends U ?
    [U] extends [T] ?
      false
    : true
  : never;

type IsUnionType<T> = true extends IsUnion<T> ? true : false;

type WithoutUndefined<T> = Exclude<T, undefined>;

// The generator represents `T | undefined` as T and carries optionality on
// the containing field or parameter. A bare undefined remains explicit.
type SchemaValue<T> =
  [WithoutUndefined<T>] extends [never] ? T : WithoutUndefined<T>;

type WithOptional<S> = S & {
  readonly optional: true;
};

type IsOptionalKey<T, K extends keyof T> =
  undefined extends T[K] ? true : false;

type TupleOptionalKeys<T extends readonly any[]> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

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

type RecursiveSchema = {
  readonly type: "recursive";
};

type AnySchema = {
  readonly type: "any";
};

type MapSchema<K, V, Seen = never> = {
  readonly type: "map";
  readonly keys: SchemaOf<K, Seen>;
  readonly values: SchemaOf<V, Seen>;
};

type SetSchema<T, Seen = never> = {
  readonly type: "set";
  readonly items: SchemaOf<T, Seen>;
};

type BytesSchema = {
  readonly type: "bytes";
};

type DateSchema = {
  readonly type: "date";
};

type UnionSchema<T, Seen = never> = {
  readonly type: "union";
  readonly anyOf: SchemaFromUnion<T, Seen>;
};

type ArraySchema<T, Seen = never> = {
  readonly type: "array";
  // TypeScript can erase distinct structural union members (for example,
  // repeated object aliases) before SchemaOf sees them. The generator still
  // preserves that union as an explicit schema node.
  readonly items: readonly [SchemaOf<T, Seen> | UnionSchema<any>];
};

type TupleSchema<T extends readonly any[], Seen = never> = {
  readonly type: "tuple";
  readonly items: SchemaFromTuple<T, Seen>;
};

type ObjectSchema<T, Seen = never> = {
  readonly type: "object";
  readonly properties: ObjectProperties<T, Seen>;
};

type SchemaKind<T> =
  IsUnionType<T> extends true ? "union"
  : IsLiteral<T> extends true ? "literal"
  : [T] extends [readonly any[]] ?
    number extends T["length"] ?
      "array"
    : "tuple"
  : [T] extends [Map<unknown, unknown>] ? "map"
  : [T] extends [ReadonlyMap<unknown, unknown>] ? "map"
  : [T] extends [Set<unknown>] ? "set"
  : [T] extends [ReadonlySet<unknown>] ? "set"
  : [T] extends [Uint8Array] ? "bytes"
  : [T] extends [Date] ? "date"
  : [T] extends [object] ? "object"
  : "primitive";

type IsAny<T> = 0 extends 1 & T ? true : false;

// A recursive reference is emitted only after the generator encounters the
// same compiler type on its active traversal path. It is intentionally an
// explicit schema node rather than the previous unchecked `any` fallback.
type SchemaOf<T, Seen = never> =
  IsAny<SchemaValue<T>> extends true ? AnySchema
  : | RecursiveSchema
    // The compiler may collapse unions of structurally identical arrays.
    | ([SchemaValue<T>] extends [readonly any[]] ?
        UnionSchema<SchemaValue<T>, Seen>
      : never)
    | Schema.Map<SchemaValue<T>, Seen | SchemaValue<T>>[SchemaKind<
        SchemaValue<T>
      >];

// JSON Schema unions are order-independent. Checking each generated member
// against the source union avoids factorial permutations of large unions.
type SchemaFromUnion<T, Seen> = readonly (T extends unknown ? SchemaOf<T, Seen>
: never)[];

type SchemaOfOptional<T, Seen> = WithOptional<SchemaOf<T, Seen>>;

type SchemaOfObjectProperty<T, K extends keyof T, Seen> =
  IsOptionalKey<T, K> extends true ? SchemaOfOptional<T[K], Seen>
  : SchemaOf<T[K], Seen>;

type SchemaOfTupleElement<T extends readonly any[], K extends keyof T, Seen> =
  K extends TupleOptionalKeys<T> ? SchemaOfOptional<T[K], Seen>
  : SchemaOf<T[K], Seen>;

type SchemaFromTuple<T extends readonly any[], Seen = never> = {
  readonly [K in keyof T]: SchemaOfTupleElement<T, K, Seen>;
};

type ObjectProperties<T, Seen> = {
  readonly [K in keyof T & string]: SchemaOfObjectProperty<T, K, Seen>;
};

type Leaf<Name extends string, Fn extends Drivers.ApiMethod> = {
  readonly name: Name;

  readonly returns: SchemaOf<Schema.ReturnWire<ReturnType<Fn>>>;
  readonly args: SchemaFromTuple<Parameters<Fn>>;

  readonly ui?: Schema.Ui.Args<Parameters<Fn>>;
};

type Branch<Name extends string, T extends Drivers.ApiRecord> = {
  readonly name: Name;
  readonly children: Schema.Schema<T>;
};

type ApiSchemaNode<Name extends string, T> =
  T extends Drivers.ApiMethod ? Leaf<Name, T>
  : T extends Drivers.ApiRecord ? Branch<Name, T>
  : never;

export namespace Schema {
  export type Node =
    | AnySchema
    | RecursiveSchema
    | PrimitiveSchema<any>
    | LiteralSchema<any>
    | UnionSchema<any>
     | ArraySchema<any>
     | TupleSchema<readonly any[]>
     | ObjectSchema<any>
     | MapSchema<any, any>
     | SetSchema<any>
     | BytesSchema
     | DateSchema;

  export namespace Ui {
    type Primitive<T> = {
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

    type Object<T> = {
      readonly label?: string;
      readonly fields?: {
        readonly [K in keyof T & string]?: Of<T[K]>;
      };
    };

    type Array = {
      readonly label?: string;
      readonly collapsible?: boolean;
    };

    type Kind<T> =
      [T] extends [readonly any[]] ? "array"
      : [T] extends [object] ? "object"
      : "primitive";

    type Map<T> = {
      readonly array: Array;
      readonly object: Object<T>;
      readonly primitive: Primitive<T>;
    };

    type Of<T> = Map<T>[Kind<T>];

    export type Args<T extends readonly any[]> = {
      readonly [K in keyof T]: Of<T[K]>;
    } & {
      readonly length: T["length"];
    };
  }

  export type Map<T, Seen = never> = {
    readonly union: UnionSchema<T, Seen>;
    readonly literal: LiteralSchema<T>;
    readonly array: [T] extends [readonly any[]] ? ArraySchema<T[number], Seen>
    : never;
    readonly tuple: [T] extends [readonly any[]] ? TupleSchema<T, Seen> : never;
    readonly map: T extends Map<infer K, infer V> ? MapSchema<K, V, Seen> :
      T extends ReadonlyMap<infer K, infer V> ? MapSchema<K, V, Seen> : never;
    readonly set: T extends Set<infer V> ? SetSchema<V, Seen> :
      T extends ReadonlySet<infer V> ? SetSchema<V, Seen> : never;
    readonly bytes: [T] extends [Uint8Array] ? BytesSchema : never;
    readonly date: [T] extends [Date] ? DateSchema : never;
    readonly object: ObjectSchema<T, Seen>;
    readonly primitive: PrimitiveSchema<T>;
  };

  export type ReturnWire<T> =
    [Awaited<T>] extends [undefined | void] ? null : Awaited<T>;

  export type Schema<T> =
    T extends Drivers.ApiRecord ?
      ReadonlyArray<
        {
          readonly [K in keyof T & string]: ApiSchemaNode<K, T[K]>;
        }[keyof T & string]
      >
    : T extends { api: Drivers.ApiRecord } ?
      ReadonlyArray<
        {
          readonly [K in keyof T["api"] & string]: ApiSchemaNode<
            K,
            T["api"][K]
          >;
        }[keyof T["api"] & string]
      >
    : never;

  export type ApiNode<Name extends string, T> = ApiSchemaNode<Name, T>;
}
