import type { Drivers } from "@av/types/drivers";

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

type WithoutUndefined<T> = Exclude<T, undefined>;

type WithOptional<S> = S & {
  readonly optional: true;
};

type IsOptionalKey<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

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

type SchemaOf<T> = Schema.Map<T>[SchemaKind<T>];

type SchemaFromUnion<T> = Permutation<T extends any ? SchemaOf<T> : never>;

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

type Leaf<Name extends string, Fn extends Drivers.ApiMethod> = {
  readonly name: Name;

  // Source API return type, after Promise resolution and JSON wire coercion.
  // undefined/void return values are represented as null over the wire.
  readonly returns: SchemaOf<Schema.ReturnWire<ReturnType<Fn>>>;

  // Source API argument types.
  // null and undefined remain distinct here. A parameter expecting undefined
  // should be decoded from wire null by the transport layer, not by pretending
  // the API parameter type is null.
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

  export type Map<T> = {
    readonly union: UnionSchema<T>;
    readonly literal: LiteralSchema<T>;
    readonly array: [T] extends [readonly (infer U)[]] ? ArraySchema<U> : never;
    readonly tuple: [T] extends [readonly any[]] ? TupleSchema<T> : never;
    readonly object: ObjectSchema<T>;
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
}
