import type {
  RoomOSCommandApi,
  RoomOSKind,
  RoomOSObject,
  RoomOSProduct,
  RoomOSProductTarget,
  RoomOSRoot,
} from "@av/drivers/cisco/roomos/typegen/schemas/11.33.1";

export type {
  RoomOSCommandApi,
  RoomOSKind,
  RoomOSObject,
  RoomOSProduct,
  RoomOSProductTarget,
  RoomOSRoot,
} from "@av/drivers/cisco/roomos/typegen/schemas/11.33.1";

export type RoomOSSchemaKind = RoomOSKind;

export type RoomOSResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
    };

export type RoomOSWriteOperation =
  | {
      kind: "command";
      root: "xCommand";
      path: readonly string[];
      args?: Record<string, unknown>;
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

type PathValue<Tree, Path extends readonly string[]> =
  Path extends readonly [infer Head extends string, ...infer Tail extends readonly string[]] ?
    Head extends keyof Tree ? PathValue<Tree[Head], Tail>
    : never
  : Tree;

type PathTree<Path extends readonly string[], Value> =
  Path extends readonly [infer Head extends string, ...infer Tail extends readonly string[]] ?
    { [K in Head]: PathTree<Tail, Value> }
  : Value;

type ValidateFeedbackPath<Tree, Path extends readonly string[]> =
  Path extends readonly [infer Head extends string, ...infer Tail extends readonly string[]] ?
    Head extends keyof Tree ?
      Tail extends readonly [] ? Path
      : IsPlainObject<Tree[Head]> extends true ?
        ValidateFeedbackPath<Tree[Head], Tail> extends never ? never : Path
      : never
    : never
  : never;

type FeedbackSubscriptionsFor<Tree, Subscriptions extends readonly (readonly string[])[]> = {
  [Index in keyof Subscriptions]: Subscriptions[Index] extends readonly string[] ?
    ValidateFeedbackPath<Tree, Subscriptions[Index]>
  : never;
};

type FeedbackStateFromSubscriptions<Tree, Subscriptions extends readonly (readonly string[])[]> =
  [Subscriptions[number]] extends [never] ? {}
  : Simplify<UnionToIntersection<Subscriptions[number] extends infer Path ?
      Path extends readonly string[] ? PathTree<Path, PathValue<Tree, Path>>
      : never
    : never>>;

type Gettable<Value> = { get: () => Promise<RoomOSResult<Value>> };
type Settable<Value> = { set: (value: Value) => Promise<RoomOSResult<Value>> };
type Listenable<Value> = {
  on: (handler: (value: Value) => void) => () => void;
  once: (handler: (value: Value) => void) => Promise<Value>;
};

type FeedbackNode<Value, State> = {
  subscribe: (callback?: (value: Value, state: State) => void) => Promise<RoomOSResult<void>>;
} & Listenable<Value>;

type Configify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Configify<Value[K]> } & Gettable<Value> & Settable<Value> & Listenable<Value>
  : Gettable<Value> & Settable<Value> & Listenable<Value>;

type Statusify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Statusify<Value[K]> } & Gettable<Value> & Listenable<Value>
  : Gettable<Value> & Listenable<Value>;

type Feedbackify<Value, State> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Feedbackify<Value[K], State> } & FeedbackNode<Value, State>
  : FeedbackNode<Value, State>;

type RootKindApi<Kind extends RoomOSKind, Value, State> =
  Kind extends "Command" ? Value
  : Kind extends "Configuration" ? Configify<Value>
  : Kind extends "Status" ? Statusify<Value>
  : Kind extends "Event" ? Feedbackify<Value, State>
  : never;

type RootApiFor<Product extends RoomOSProductTarget, Kind extends RoomOSKind, State> =
  RootKindApi<Kind, MergeEntries<EntriesForProduct<Kind, Product>, never>, State>;

export type RoomOSFeedbackState<Product extends RoomOSProductTarget = "any"> =
  MergeEntries<EntriesForProduct<"Event", Product>, never>;

export type RoomOSFeedbackSubscriptions<
  Product extends RoomOSProductTarget,
  Subscriptions extends readonly (readonly string[])[],
> = FeedbackSubscriptionsFor<RoomOSFeedbackState<Product>, Subscriptions>;

export type RoomOSState<
  Product extends RoomOSProductTarget,
  Subscriptions extends readonly (readonly string[])[] = readonly [],
> = FeedbackStateFromSubscriptions<RoomOSFeedbackState<Product>, Subscriptions>;

export type RoomOSFeedbackApi<
  Product extends RoomOSProductTarget = "any",
  State = RoomOSFeedbackState<Product>,
> = Feedbackify<RoomOSFeedbackState<Product>, State>;

export type RoomOSConfigurationApi<Product extends RoomOSProductTarget = "any"> =
  RootApiFor<Product, "Configuration", never>;

export type RoomOSStatusApi<Product extends RoomOSProductTarget = "any"> =
  RootApiFor<Product, "Status", never>;

export type RoomOSApi<
  Product extends RoomOSProductTarget = "any",
  State = RoomOSFeedbackState<Product>,
> = {
  xCommand: RoomOSCommandApi<Product, Promise<RoomOSResult<any>>>;
  xConfiguration: RoomOSConfigurationApi<Product>;
  xStatus: RoomOSStatusApi<Product>;
  xFeedback: RoomOSFeedbackApi<Product, State>;
};

export type TMapToX<
  Product extends RoomOSProductTarget = "any",
  Output extends TOutput = TOutput,
  State = RoomOSState<Product>,
> = RoomOSApi<Product, State>;

export type RoomOSRootApi<
  Product extends RoomOSProductTarget,
  Root extends RoomOSRoot,
  State = RoomOSFeedbackState<Product>,
> = Root extends "xCommand" ? RoomOSApi<Product, State>["xCommand"]
  : Root extends "xConfiguration" ? RoomOSApi<Product, State>["xConfiguration"]
  : Root extends "xStatus" ? RoomOSApi<Product, State>["xStatus"]
  : Root extends "xFeedback" ? RoomOSApi<Product, State>["xFeedback"]
  : never;

export type RoomOSEntry = RoomOSObject;

export type RoomOSApiReturn<Output extends TOutput> = Promise<RoomOSResult<any>>;
