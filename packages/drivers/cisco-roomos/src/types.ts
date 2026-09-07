import type { Natav } from "@nat-av/core";
import type { GeneratedRoomOS } from "../generated.js";

export type RoomOSSchema = {
  Version: string;
  Product: string;
  ProductTarget: string;
  CommandApi: { any: unknown };
  Configuration: { any: unknown };
  Status: { any: unknown };
  Event: { any: unknown };
  EventByNormPath: object;
  EventSubscriptionShape: object;
};

export type RoomOSSchemaSet = {
  any: RoomOSSchema;
};

type IsPlainObject<V> =
  [V] extends [readonly any[]] ? false
  : [V] extends [object] ? true
  : false;

type UnwrapStateRoot<Tree, Root extends string> =
  Root extends keyof Tree ? Tree[Root] : Tree;

type JoinPath<Prefix extends string, Segment extends string> =
  Prefix extends "" ? Segment : `${Prefix} ${Segment}`;

type SubscriptionTree<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]?: true | SubscriptionTree<Value[K]> }
  : true;

type EventNamesWithPrefix<
  EventMap extends Record<string, unknown>,
  Prefix extends string,
> = Extract<keyof EventMap, Prefix | `${Prefix} ${string}`>;

type SelectedSubscriptionPaths<Selected, Prefix extends string = ""> =
  IsPlainObject<Selected> extends true ?
    {
      [K in keyof Selected & string]: Selected[K] extends true ?
        JoinPath<Prefix, K>
      : SelectedSubscriptionPaths<Selected[K], JoinPath<Prefix, K>>;
    }[keyof Selected & string]
  : never;

type EventNamesFromSubscriptions<
  Selected,
  EventMap extends Record<string, unknown>,
> =
  [Selected] extends [never] ? never
  : Selected extends { xFeedback?: infer Feedback } ?
    SelectedSubscriptionPaths<Feedback> extends infer Path extends string ?
      Path extends keyof EventMap ?
        Path
      : EventNamesWithPrefix<EventMap, Path>
    : never
  : never;

type PickMap<Map, Keys extends keyof Map> = {
  [K in Keys]: Map[K];
};

type SchemaAt<
  SchemaSet extends RoomOSSchemaSet,
  Version extends keyof SchemaSet,
> = SchemaSet[Version];

type ProductTargetOf<Schema extends RoomOSSchema> = Schema["ProductTarget"];

type ProductMapValue<
  Schema extends RoomOSSchema,
  Key extends "CommandApi" | "Configuration" | "Status" | "Event",
  Product extends string,
> =
  Product extends "any" ?
    Schema[Key] extends { any: infer Any } ?
      Any
    : never
  : Product extends keyof Schema[Key] ? Schema[Key][Product]
  : never;

type EventMapOf<Schema extends RoomOSSchema> = Schema["EventByNormPath"] &
  Record<string, unknown>;

type EventSubscriptionShapeOf<Schema extends RoomOSSchema> =
  Schema["EventSubscriptionShape"] & object;

type RemoteResult<Value> = Promise<RoomOS.Result<Value>>;

type Gettable<Value> = { get: () => RemoteResult<Value> };
type Settable<Value> = { set: (value: Value) => RemoteResult<Value> };

type FeedbackNode<Value, State> = {
  get: () => Value;
  subscribe: (
    callback?: (value: Value, state: State) => void,
  ) => RemoteResult<RoomOS.HeldSubscription>;
};

type RootState<
  Schema extends RoomOSSchema,
  Product extends ProductTargetOf<Schema>,
> = {
  xConfiguration: UnwrapStateRoot<
    ProductMapValue<Schema, "Configuration", Product>,
    "Configuration"
  >;
  xStatus: UnwrapStateRoot<
    ProductMapValue<Schema, "Status", Product>,
    "Status"
  >;
  xFeedback: ProductMapValue<Schema, "Event", Product>;
};

type PruneBySubscriptions<Value, Subscriptions> =
  [Subscriptions] extends [true] ? Value
  : IsPlainObject<Value> extends true ?
    Subscriptions extends object ?
      {
        [K in keyof Subscriptions & keyof Value]: PruneBySubscriptions<
          Value[K],
          NonNullable<Subscriptions[K]>
        >;
      }
    : never
  : Value;

type StateFromSubscriptions<
  Schema extends RoomOSSchema,
  Product extends ProductTargetOf<Schema>,
  Subscriptions,
> = {
  [
    K in keyof Subscriptions & keyof RootState<Schema, Product>
  ]: PruneBySubscriptions<
    RootState<Schema, Product>[K],
    NonNullable<Subscriptions[K]>
  >;
};

type Configify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Configify<Value[K]> } & Gettable<Value> &
      Settable<Value>
  : Gettable<Value> & Settable<Value>;

type Statusify<Value> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Statusify<Value[K]> } & Gettable<Value>
  : Gettable<Value>;

type CommandRecordify<Value> =
  Value extends (...args: infer Args) => infer Return ?
    (...args: Args) => RemoteResult<Return>
  : IsPlainObject<Value> extends true ?
    { [K in keyof Value]: CommandRecordify<Value[K]> } & Natav.ApiRecord
  : () => RemoteResult<Value>;

type Feedbackify<Value, State> =
  IsPlainObject<Value> extends true ?
    { [K in keyof Value]: Feedbackify<Value[K], State> } & FeedbackNode<
      Value,
      State
    >
  : FeedbackNode<Value, State>;

type ApiRecordify<Value> =
  Value extends (...args: any[]) => any ? Value
  : IsPlainObject<Value> extends true ?
    { [K in keyof Value]: ApiRecordify<Value[K]> } & Natav.ApiRecord
  : never;

export namespace RoomOS {
  export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

  export type ProductTarget<Schema extends RoomOSSchema = RoomOSSchema> =
    ProductTargetOf<Schema>;

  export type VersionTarget<
    SchemaSet extends RoomOSSchemaSet = RoomOSSchemaSet,
  > = keyof SchemaSet & string;

  export type ConfigurationSubscriptionTree<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = SubscriptionTree<
    UnwrapStateRoot<
      ProductMapValue<Schema, "Configuration", Product>,
      "Configuration"
    >
  >;

  export type StatusSubscriptionTree<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = SubscriptionTree<
    UnwrapStateRoot<ProductMapValue<Schema, "Status", Product>, "Status">
  >;

  export type FeedbackSubscriptionTree<
    Schema extends RoomOSSchema = RoomOSSchema,
  > = SubscriptionTree<EventSubscriptionShapeOf<Schema>>;

  export type Sub<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = {
    xConfiguration?: ConfigurationSubscriptionTree<Schema, Product> | true;
    xStatus?: StatusSubscriptionTree<Schema, Product> | true;
    xFeedback?: FeedbackSubscriptionTree<Schema> | true;
  };

  export type ConfigurationState<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = ProductMapValue<Schema, "Configuration", Product>;

  export type StatusState<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = ProductMapValue<Schema, "Status", Product>;

  export type EventState<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = ProductMapValue<Schema, "Event", Product>;

  export type EventMap<Schema extends RoomOSSchema = RoomOSSchema> =
    EventMapOf<Schema>;

  export type EventName<Schema extends RoomOSSchema = RoomOSSchema> =
    keyof EventMap<Schema>;

  export type FeedbackSubscriptions<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = Sub<Schema, Product>;

  export type SubscribedEventName<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
    Subscriptions extends FeedbackSubscriptions<Schema, Product> =
      FeedbackSubscriptions<Schema, Product>,
  > = EventNamesFromSubscriptions<Subscriptions, EventMap<Schema>>;

  export type SubscribedEventMap<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
    Subscriptions extends FeedbackSubscriptions<Schema, Product> =
      FeedbackSubscriptions<Schema, Product>,
  > = PickMap<
    EventMap<Schema>,
    Extract<
      SubscribedEventName<Schema, Product, Subscriptions>,
      EventName<Schema>
    >
  >;

  export type State<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
    Subscriptions extends FeedbackSubscriptions<Schema, Product> =
      FeedbackSubscriptions<Schema, Product>,
    StrictState extends boolean = false,
  > =
    StrictState extends true ?
      StateFromSubscriptions<Schema, Product, Subscriptions>
    : RootState<Schema, Product>;

  export type ConfigurationApi<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = ApiRecordify<Configify<ConfigurationState<Schema, Product>>>;

  export type StatusApi<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
  > = ApiRecordify<Statusify<StatusState<Schema, Product>>>;

  export type Api<
    Schema extends RoomOSSchema = RoomOSSchema,
    Product extends ProductTargetOf<Schema> = ProductTargetOf<Schema>,
    State = EventState<Schema, Product>,
  > = {
    xCommand: CommandRecordify<ProductMapValue<Schema, "CommandApi", Product>>;
    xConfiguration: ConfigurationApi<Schema, Product>;
    xStatus: StatusApi<Schema, Product>;
    xFeedback: ApiRecordify<Feedbackify<EventState<Schema, Product>, State>>;
  };

  type TError = { code: number; message: string; data?: any };

  export type Result<T = any> =
    { ok: true; data: T } | { ok: false; error: TError };

  export type WriteOperation =
    | {
        kind: "command";
        root: "xCommand";
        path: string[];
        args?: Record<string, unknown>;
        body?: string;
      }
    | {
        kind: "get";
        root: "xConfiguration" | "xStatus";
        path: string[];
      }
    | {
        kind: "set";
        root: "xConfiguration";
        path: string[];
        value: unknown;
      }
    | {
        kind: "sub";
        root: "xConfiguration" | "xStatus" | "xFeedback";
        path: string[];
      }
    | {
        kind: "unsub";
        root: "xConfiguration" | "xStatus" | "xFeedback";
        subId?: number;
        path: string[];
      };

  export type ReadOperation =
    | { kind: "update"; data: { path: string[]; value: unknown } }
    | { kind: "subscribed"; data: HeldSubscription }
    | { kind: "unsubscribed"; data: HeldSubscription[] }
    | { kind: "command_response"; data: unknown }
    | { kind: "error"; data: TError };

  export type HeldSubscription = {
    path: string[];
    id: number;
  };

  export const ErrorCodes = {
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
    ParseError: -32700,
    CommandError: 1,
    PermissionDenied: -31999,
    SubscriberCountExceeded: -31998,
    NotReady: -31997,
    CODE_NOT_FOUND: -90001,
    INVALID_RESPONSE: -90002,
    XSET_RETURNED_FALSE: -90003,
    INVALID_NOTIFICATION: -90004,
    INVALID_WRITE_OPERATION: -90005,
    INVALID_READ_OPERATION: -90006,
  } as const;

  export type ErrorCode = keyof typeof ErrorCodes;

  export namespace Rx {
    export type RegisterFeedback = {
      Id: number;
    };
  }
}

export type DefaultRoomOSSchemaSet = GeneratedRoomOS;
