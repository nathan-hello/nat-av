import roomOSSchema from "@av/drivers/cisco/roomos/typegen";

type RoomOSSchema = typeof roomOSSchema;
type RoomOSObject = RoomOSSchema["objects"][number];
type RoomOSProduct = RoomOSObject["products"][number];
type RoomOSKind = RoomOSObject["type"];

type ValuespaceObject = {
  type?: string;
  Values?: readonly string[];
  multiple?: string | number | boolean;
};

export type RoomOSProductTarget = RoomOSProduct | "any";
export type RoomOSRoot = "xCommand" | "xConfiguration" | "xStatus" | "xFeedback";
export type RoomOSSchemaKind = RoomOSKind;

export type TOutput =
  | {
      type: "terminal";
      getResultId?: () => string | number;
    }
  | {
      type: "xml";
      getResultId?: () => string | number;
    }
  | {
      type: "jsonrpc";
      getId: () => string | number;
    }
  | {
      type: "http";
      getSessionId: () => string;
    };

export type TMapReturn<T extends TOutput["type"]> = T extends "http" ? Request : string;

export type TArgument = Record<string, unknown> | string | undefined;

export type RoomOSCommandArgs = Record<string, unknown>;

export type RoomOSWriteOperation =
  | {
      kind: "command";
      root: "xCommand";
      path: readonly string[];
      args?: RoomOSCommandArgs;
      body?: string;
    }
  | {
      kind: "get";
      root: "xConfiguration" | "xStatus";
      path: readonly string[];
    }
  | {
      kind: "set";
      root: "xConfiguration";
      path: readonly string[];
      value: unknown;
    }
  | {
      kind: "listen";
      root: "xConfiguration" | "xStatus" | "xFeedback";
      path: readonly string[];
    };

export interface TRoomOSWriter {
  ToTerminal(resultId?: number | string): string;
  ToXml(resultId?: number | string): string;
  ToJsonRpc(id?: number | string): string;
  ToHttp(sessionId: string): Request;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type UnionToIntersection<U> =
  (U extends any ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

type SplitPath<Path extends string> =
  Path extends `${infer Head} ${infer Tail}` ? [Head, ...SplitPath<Tail>] : [Path];

type StripIndex<Segment extends string> = Segment extends `${infer Head}[${string}]` ? Head : Segment;

type IsIndexedSegment<Segment extends string> = Segment extends `${string}[${string}]` ? true : false;

type IsTruthyFlag<V> = V extends true | "True" ? true : false;

type IsPlainObject<V> = [V] extends [readonly any[]] ? false
  : [V] extends [object] ? true
  : false;

type EntriesForProduct<Kind extends RoomOSKind, Product extends RoomOSProductTarget> =
  Extract<RoomOSObject, { type: Kind }> extends infer Entry ?
    Entry extends RoomOSObject ?
      Product extends "any" ? Entry
      : Product extends Entry["products"][number] ? Entry
      : never
    : never
  : never;

type ValueFromValuespace<V> =
  V extends { type: "Integer" } ? number
  : V extends { type: "IntegerArray" } ? number[]
  : V extends { type: "String" } ? string
  : V extends { type: "StringArray" } ? string[]
  : V extends { type: "Literal"; Values: readonly (infer LiteralValue extends string)[] } ? LiteralValue
  : V extends { type: "LiteralArray"; Values: readonly (infer LiteralArrayValue extends string)[] } ? LiteralArrayValue[]
  : V extends "int" | "Integer" ? number
  : V extends "string" | "String" ? string
  : V extends "literal" ? string
  : V extends { type: "literal"; Values?: readonly (infer EventLiteralValue extends string)[] } ?
      [EventLiteralValue] extends [never] ? string : EventLiteralValue
  : never;

type ParamsToObject<Params extends readonly unknown[]> =
  [Params[number]] extends [never] ? {}
  : Simplify<UnionToIntersection<Params[number] extends infer Param ?
      Param extends { name: infer Name extends string; required?: infer Required; valuespace: infer ValueSpace } ?
        IsTruthyFlag<Required> extends true ? { [K in Name]: ValueFromValuespace<ValueSpace> }
        : { [K in Name]?: ValueFromValuespace<ValueSpace> }
      : never
    : never>>;

type CommandCallable<Args, ReturnType, Multiline extends boolean> =
  keyof Args extends never ?
    Multiline extends true ? (body: string) => ReturnType
    : () => ReturnType
  : Multiline extends true ? (args: Args, body: string) => ReturnType
  : (args: Args) => ReturnType;

type EventPayloadChildren<Children> = Children extends Record<string, any> ? {
  [K in keyof Children & string]: EventNodeValue<Children[K]>;
} : {};

type EventNodeValue<Node> =
  Node extends { children: infer Children } ?
    IsTruthyFlag<Node extends { multiple: infer Multiple } ? Multiple : false> extends true ?
      Array<EventPayloadChildren<Children>>
    : EventPayloadChildren<Children>
  : Node extends { valuespace: infer ValueSpace } ?
    IsTruthyFlag<Node extends { multiple: infer Multiple } ? Multiple : false> extends true ?
      Array<ValueFromValuespace<ValueSpace>>
    : ValueFromValuespace<ValueSpace>
  : never;

type EntryValue<Entry extends RoomOSObject, ReturnType> =
  Entry extends { type: "Command"; attributes: { params: infer Params extends readonly unknown[]; multiline?: infer Multiline } } ?
    CommandCallable<ParamsToObject<Params>, ReturnType, IsTruthyFlag<Multiline>>
  : Entry extends { type: "Configuration" | "Status"; attributes: { valuespace: infer ValueSpace } } ?
    ValueFromValuespace<ValueSpace>
  : Entry extends { type: "Event"; attributes: { children: infer Children } } ?
    EventPayloadChildren<Children>
  : never;

type PathObjectFromSegments<Segments extends readonly string[], LeafValue> =
  Segments extends [infer Head extends string, ...infer Tail extends string[]] ?
    IsIndexedSegment<Head> extends true ?
      { [K in StripIndex<Head>]: Array<PathObjectFromSegments<Tail, LeafValue>> }
    : { [K in StripIndex<Head>]: PathObjectFromSegments<Tail, LeafValue> }
  : LeafValue;

type EntryTree<Entry extends RoomOSObject, ReturnType> = PathObjectFromSegments<SplitPath<Entry["path"]>, EntryValue<Entry, ReturnType>>;

type TreesForEntries<Entries, ReturnType> = Entries extends infer Entry ?
  Entry extends RoomOSObject ? EntryTree<Entry, ReturnType> : never
  : never;

type MergeEntries<Entries, ReturnType> =
  [Entries] extends [never] ? {}
  : Simplify<UnionToIntersection<TreesForEntries<Entries, ReturnType>>>;

type Gettable<Value, ReturnType> = { get: () => ReturnType };
type Settable<Value, ReturnType> = { set: (value: Value) => ReturnType };
type Listenable<Value, ReturnType> = {
  on: (handler: (value: Value) => void) => ReturnType;
  once: (handler: (value: Value) => void) => ReturnType;
};

type Configify<Value, ReturnType> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Configify<Value[K], ReturnType> } & Gettable<Value, ReturnType> & Settable<Value, ReturnType> & Listenable<Value, ReturnType>
  : Gettable<Value, ReturnType> & Settable<Value, ReturnType> & Listenable<Value, ReturnType>;

type Statusify<Value, ReturnType> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Statusify<Value[K], ReturnType> } & Gettable<Value, ReturnType> & Listenable<Value, ReturnType>
  : Gettable<Value, ReturnType> & Listenable<Value, ReturnType>;

type Eventify<Value, ReturnType> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Eventify<Value[K], ReturnType> } & Listenable<Value, ReturnType>
  : Listenable<Value, ReturnType>;

type RootKindApi<Kind extends RoomOSKind, Value, ReturnType> =
  Kind extends "Command" ? Value
  : Kind extends "Configuration" ? Configify<Value, ReturnType>
  : Kind extends "Status" ? Statusify<Value, ReturnType>
  : Kind extends "Event" ? Eventify<Value, ReturnType>
  : never;

type RootApiFor<Product extends RoomOSProductTarget, Kind extends RoomOSKind, ReturnType> =
  RootKindApi<Kind, MergeEntries<EntriesForProduct<Kind, Product>, ReturnType>, ReturnType>;

export type RoomOSApi<
  Product extends RoomOSProductTarget = "any",
  ReturnType = string,
> = {
  xCommand: RootApiFor<Product, "Command", ReturnType>;
  xConfiguration: RootApiFor<Product, "Configuration", ReturnType>;
  xStatus: RootApiFor<Product, "Status", ReturnType>;
  xFeedback: RootApiFor<Product, "Event", ReturnType>;
};

export type TMapToX<
  Product extends RoomOSProductTarget = "any",
  Output extends TOutput = TOutput,
> = RoomOSApi<Product, TMapReturn<Output["type"]>>;

export type RoomOSRootApi<
  Product extends RoomOSProductTarget,
  Root extends RoomOSRoot,
  ReturnType,
> = Root extends "xCommand" ? RoomOSApi<Product, ReturnType>["xCommand"]
  : Root extends "xConfiguration" ? RoomOSApi<Product, ReturnType>["xConfiguration"]
  : Root extends "xStatus" ? RoomOSApi<Product, ReturnType>["xStatus"]
  : Root extends "xFeedback" ? RoomOSApi<Product, ReturnType>["xFeedback"]
  : never;

export type RoomOSEntry = RoomOSObject;

export type RoomOSApiReturn<Output extends TOutput> = TMapReturn<Output["type"]>;
