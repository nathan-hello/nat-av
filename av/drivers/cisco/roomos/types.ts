import type { GeneratedRoomOS } from "@av/drivers/cisco/roomos/typegen/schemas/11.33.1";
import type { Drivers } from "@av/types/drivers";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsPlainObject<V> =
  [V] extends [readonly any[]] ? false
  : [V] extends [object] ? true
  : false;

type ArrayElement<V> = V extends readonly (infer Item)[] ? Item : never;

type UnwrapStateRoot<Tree, Root extends string> =
  Root extends keyof Tree ? Tree[Root] : Tree;

type JoinPath<Prefix extends string, Segment extends string> =
  Prefix extends "" ? Segment : `${Prefix} ${Segment}`;

type EventNamesWithPrefix<Prefix extends string> =
  Extract<GeneratedRoomOS.EventName, Prefix | `${Prefix} ${string}`>;

type SelectedSubscriptionPaths<Selected, Prefix extends string = ""> =
  IsPlainObject<Selected> extends true ?
  {
    [K in keyof Selected & string]: Selected[K] extends true ?
      JoinPath<Prefix, K>
    : SelectedSubscriptionPaths<Selected[K], JoinPath<Prefix, K>>;
  }[keyof Selected & string]
  : never;

type EventNamesFromSubscriptions<Selected> =
  SelectedSubscriptionPaths<Selected> extends infer Path extends string ?
    Path extends GeneratedRoomOS.EventName ?
      Extract<GeneratedRoomOS.EventName, Path>
    : EventNamesWithPrefix<Path>
  : never;

type PickMap<Map, Keys extends keyof Map> = {
  [K in Keys]: Map[K];
};

type Gettable<Value> = { get: () => Promise<RoomOS.Result<Value>> };
type Settable<Value> = { set: (value: Value) => Promise<RoomOS.Result<Value>> };

type FeedbackNode<Value, State> = {
  get: () => Value;
  subscribe: (
    callback?: (value: Value, state: State) => void,
  ) => Promise<RoomOS.Result<RoomOS.HeldSubscription>>;
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
    { [K in keyof Value]: ApiRecordify<Value[K]> } & Drivers.ApiRecord
  : never;

export type { GeneratedRoomOS as Generated };

export namespace RoomOS {
  export type ConfigurationState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.Configuration<Product>;

  export type StatusState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.Status<Product>;

  export type EventState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.Event<Product>;

  export type EventMap<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.EventByNormPath;

  export type EventName<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = keyof EventMap<Product>;

  export type FeedbackSubscriptions<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.EventSubscriptions;

  export type SubscribedEventName<
    Product extends GeneratedRoomOS.ProductTarget = "any",
    Subscriptions extends FeedbackSubscriptions<Product> = never,
  > = EventNamesFromSubscriptions<Subscriptions>;

  export type SubscribedEventMap<
    Product extends GeneratedRoomOS.ProductTarget = "any",
    Subscriptions extends FeedbackSubscriptions<Product> = never,
  > = PickMap<
    EventMap<Product>,
    Extract<SubscribedEventName<Product, Subscriptions>, EventName<Product>>
  >;

  export type State<
    Product extends GeneratedRoomOS.ProductTarget,
  > = {
    xConfiguration: UnwrapStateRoot<ConfigurationState<Product>, "Configuration">;
    xStatus: UnwrapStateRoot<StatusState<Product>, "Status">;
    xFeedback: EventState<Product>;
  };

  export type ConfigurationApi<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = ApiRecordify<Configify<ConfigurationState<Product>>>;

  export type StatusApi<Product extends GeneratedRoomOS.ProductTarget = "any"> =
    ApiRecordify<Statusify<StatusState<Product>>>;

  export type Api<
    Product extends GeneratedRoomOS.ProductTarget = "any",
    State = EventState<Product>,
  > = {
    xCommand: ApiRecordify<GeneratedRoomOS.CommandApi<Product>>;
    xConfiguration: ConfigurationApi<Product>;
    xStatus: StatusApi<Product>;
    xFeedback: ApiRecordify<Feedbackify<EventState<Product>, State>>;
  };

  type TError = { code: number; message: string; data?: any };

  export type Result<T = any> =
    | { ok: true; data: T }
    | { ok: false; error: TError };

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
