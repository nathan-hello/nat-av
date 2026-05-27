import type { GeneratedRoomOS } from "@av/drivers/cisco/roomos/typegen/schemas/11.33.1";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type UnionToIntersection<U> =
  (U extends any ? (value: U) => void : never) extends (
    (value: infer I) => void
  ) ?
    I
  : never;

type SplitPath<Path extends string> =
  Path extends `${infer Head} ${infer Tail}` ? [Head, ...SplitPath<Tail>]
  : [Path];

type StripIndex<Segment extends string> =
  Segment extends `${infer Head}[${string}]` ? Head : Segment;

type IsIndexedSegment<Segment extends string> =
  Segment extends `${string}[${string}]` ? true : false;

type IsTruthyFlag<V> = V extends true | "True" ? true : false;

type IsPlainObject<V> =
  [V] extends [readonly any[]] ? false
  : [V] extends [object] ? true
  : false;

type ArrayElement<V> = V extends readonly (infer Item)[] ? Item : never;

type FeedbackSubscriptionValue<Tree> =
  Tree extends readonly any[] ? true | FeedbackSubscriptionsFor<ArrayElement<Tree>>
  : IsPlainObject<Tree> extends true ? true | FeedbackSubscriptionsFor<Tree>
  : true;

type FeedbackSubscriptionsFor<Tree> =
  IsPlainObject<Tree> extends true ?
    {
      [K in keyof Tree]?: FeedbackSubscriptionValue<Tree[K]>;
    }
  : never;

type EntriesForProduct<
  Kind extends GeneratedRoomOS.Kind,
  Product extends GeneratedRoomOS.ProductTarget,
> =
  Extract<GeneratedRoomOS.Object, { type: Kind }> extends infer Entry ?
    Entry extends GeneratedRoomOS.Object ?
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
  : V extends (
    { type: "Literal"; Values: readonly (infer LiteralValue extends string)[] }
  ) ?
    LiteralValue
  : V extends (
    {
      type: "LiteralArray";
      Values: readonly (infer LiteralArrayValue extends string)[];
    }
  ) ?
    LiteralArrayValue[]
  : V extends "int" | "Integer" ? number
  : V extends "string" | "String" ? string
  : V extends "literal" ? string
  : V extends (
    {
      type: "literal";
      Values?: readonly (infer EventLiteralValue extends string)[];
    }
  ) ?
    [EventLiteralValue] extends [never] ?
      string
    : EventLiteralValue
  : never;

type ParamsToObject<Params extends readonly unknown[]> =
  [Params[number]] extends [never] ? {}
  : Simplify<
      UnionToIntersection<
        Params[number] extends infer Param ?
          Param extends (
            {
              name: infer Name extends string;
              required?: infer Required;
              valuespace: infer ValueSpace;
            }
          ) ?
            IsTruthyFlag<Required> extends true ?
              { [K in Name]: ValueFromValuespace<ValueSpace> }
            : { [K in Name]?: ValueFromValuespace<ValueSpace> }
          : never
        : never
      >
    >;

type CommandCallable<Args, ReturnType, Multiline extends boolean> =
  keyof Args extends never ?
    Multiline extends true ?
      (body: string) => ReturnType
    : () => ReturnType
  : Multiline extends true ? (args: Args, body: string) => ReturnType
  : (args: Args) => ReturnType;

type EventPayloadChildren<Children> =
  Children extends Record<string, any> ?
    {
      [K in keyof Children & string]: EventNodeValue<Children[K]>;
    }
  : {};

type EventNodeValue<Node> =
  Node extends { children: infer Children } ?
    IsTruthyFlag<
      Node extends { multiple: infer Multiple } ? Multiple : false
    > extends true ?
      Array<EventPayloadChildren<Children>>
    : EventPayloadChildren<Children>
  : Node extends { valuespace: infer ValueSpace } ?
    IsTruthyFlag<
      Node extends { multiple: infer Multiple } ? Multiple : false
    > extends true ?
      Array<ValueFromValuespace<ValueSpace>>
    : ValueFromValuespace<ValueSpace>
  : never;

type EntryValue<Entry extends GeneratedRoomOS.Object, ReturnType> =
  Entry extends (
    {
      type: "Command";
      attributes: {
        params: infer Params extends readonly unknown[];
        multiline?: infer Multiline;
      };
    }
  ) ?
    CommandCallable<ParamsToObject<Params>, ReturnType, IsTruthyFlag<Multiline>>
  : Entry extends (
    {
      type: "Configuration" | "Status";
      attributes: { valuespace: infer ValueSpace };
    }
  ) ?
    ValueFromValuespace<ValueSpace>
  : Entry extends { type: "Event"; attributes: { children: infer Children } } ?
    EventPayloadChildren<Children>
  : never;

type PathObjectFromSegments<Segments extends readonly string[], LeafValue> =
  Segments extends [infer Head extends string, ...infer Tail extends string[]] ?
    IsIndexedSegment<Head> extends true ?
      {
        [K in StripIndex<Head>]: Array<PathObjectFromSegments<Tail, LeafValue>>;
      }
    : { [K in StripIndex<Head>]: PathObjectFromSegments<Tail, LeafValue> }
  : LeafValue;

type EntryTree<
  Entry extends GeneratedRoomOS.Object,
  ReturnType,
> = PathObjectFromSegments<
  SplitPath<Entry["path"]>,
  EntryValue<Entry, ReturnType>
>;

type TreesForEntries<Entries, ReturnType> =
  Entries extends infer Entry ?
    Entry extends GeneratedRoomOS.Object ?
      EntryTree<Entry, ReturnType>
    : never
  : never;

type MergeEntries<Entries, ReturnType> =
  [Entries] extends [never] ? {}
  : Simplify<UnionToIntersection<TreesForEntries<Entries, ReturnType>>>;

type FeedbackStateFromSubscriptions<Tree, Subscriptions> =
  [Subscriptions] extends [never] ? {}
  : Subscriptions extends Record<string, any> ?
    Simplify<{
      [K in keyof Subscriptions & keyof Tree]: Subscriptions[K] extends true ?
        Tree[K]
      : Tree[K] extends readonly any[] ? Array<FeedbackStateFromSubscriptions<ArrayElement<Tree[K]>, Subscriptions[K]>>
      : IsPlainObject<Tree[K]> extends true ?
        FeedbackStateFromSubscriptions<Tree[K], Subscriptions[K]>
      : Tree[K];
    }>
  : {};

type Gettable<Value> = { get: () => Promise<RoomOS.Result<Value>> };
type Settable<Value> = { set: (value: Value) => Promise<RoomOS.Result<Value>> };
type Listenable<Value> = {
  on: (handler: (value: Value) => void) => () => void;
  once: (handler: (value: Value) => void) => Promise<Value>;
};

type FeedbackNode<Value, State> = {
  subscribe: (
    callback?: (value: Value, state: State) => void,
  ) => Promise<RoomOS.Result<void>>;
} & Listenable<Value>;

type Configify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Configify<Value[K]> } & Gettable<Value> &
      Settable<Value> &
      Listenable<Value>
  : Gettable<Value> & Settable<Value> & Listenable<Value>;

type Statusify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Statusify<Value[K]> } & Gettable<Value> &
      Listenable<Value>
  : Gettable<Value> & Listenable<Value>;

type Feedbackify<Value, State> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Feedbackify<Value[K], State> } & FeedbackNode<
      Value,
      State
    >
  : FeedbackNode<Value, State>;

type RootKindApi<Kind extends GeneratedRoomOS.Kind, Value, State> =
  Kind extends "Command" ? Value
  : Kind extends "Configuration" ? Configify<Value>
  : Kind extends "Status" ? Statusify<Value>
  : Kind extends "Event" ? Feedbackify<Value, State>
  : never;

type RootApiFor<
  Product extends GeneratedRoomOS.ProductTarget,
  Kind extends GeneratedRoomOS.Kind,
  State,
> = RootKindApi<
  Kind,
  MergeEntries<EntriesForProduct<Kind, Product>, never>,
  State
>;

export type { GeneratedRoomOS as Generated };

export namespace RoomOS {
  export type FeedbackState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = MergeEntries<EntriesForProduct<"Event", Product>, never>;

  export type FeedbackSubscriptions<
    Product extends GeneratedRoomOS.ProductTarget,
  > = FeedbackSubscriptionsFor<FeedbackState<Product>>;

  export type State<
    Product extends GeneratedRoomOS.ProductTarget,
    Subscriptions extends FeedbackSubscriptions<Product> = never,
  > = FeedbackStateFromSubscriptions<FeedbackState<Product>, Subscriptions>;

  export type ConfigurationApi<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = RootApiFor<Product, "Configuration", never>;

  export type StatusApi<Product extends GeneratedRoomOS.ProductTarget = "any"> =
    RootApiFor<Product, "Status", never>;

  export type Api<
    Product extends GeneratedRoomOS.ProductTarget = "any",
    State = FeedbackState<Product>,
  > = {
    xCommand: GeneratedRoomOS.CommandApi<Product, Promise<Result<any>>>;
    xConfiguration: ConfigurationApi<Product>;
    xStatus: StatusApi<Product>;
    xFeedback: Feedbackify<FeedbackState<Product>, State>;
  };

  export type Result<T = any> =
    | { ok: true; data: T }
    | { ok: false; error: string };

  export type WriteOperation =
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

  export type Format =
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

  export interface TWriter {
    ToTerminal(resultId?: number | string): string;
    ToXml(resultId?: number | string): string;
    ToJsonRpc(id?: number | string): string;
  }
}
