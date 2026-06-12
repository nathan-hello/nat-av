import type { GeneratedRoomOS } from "@av/drivers/cisco/roomos/typegen/schemas/11.33.1";
import type { Drivers } from "@av/types/drivers";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsPlainObject<V> =
  [V] extends [readonly any[]] ? false
  : [V] extends [object] ? true
  : false;

type ArrayElement<V> = V extends readonly (infer Item)[] ? Item : never;

type FeedbackSubscriptionValue<Tree> =
  Tree extends readonly any[] ?
    true | FeedbackSubscriptionsFor<ArrayElement<Tree>>
  : IsPlainObject<Tree> extends true ? true | FeedbackSubscriptionsFor<Tree>
  : true;

type FeedbackSubscriptionsFor<Tree> =
  IsPlainObject<Tree> extends true ?
    {
      [K in keyof Tree]?: FeedbackSubscriptionValue<Tree[K]>;
    }
  : never;

type FeedbackStateFromSubscriptions<Tree, Subscriptions> =
  [Subscriptions] extends [never] ? {}
  : Subscriptions extends Record<string, any> ?
    Simplify<{
      [K in keyof Subscriptions & keyof Tree]: Subscriptions[K] extends true ?
        Tree[K]
      : Tree[K] extends readonly any[] ?
        Array<
          FeedbackStateFromSubscriptions<
            ArrayElement<Tree[K]>,
            Subscriptions[K]
          >
        >
      : IsPlainObject<Tree[K]> extends true ?
        FeedbackStateFromSubscriptions<Tree[K], Subscriptions[K]>
      : Tree[K];
    }>
  : {};

type Gettable<Value> = { get: () => Promise<RoomOS.Result<Value>> };
type Settable<Value> = { set: (value: Value) => Promise<RoomOS.Result<Value>> };

type FeedbackNode<Value, State> = {
  subscribe: (
    callback?: (value: Value, state: State) => void,
  ) => Promise<RoomOS.Result<void>>;
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

  export type FeedbackSubscriptions<
    Product extends GeneratedRoomOS.ProductTarget,
  > = FeedbackSubscriptionsFor<EventState<Product>>;

  export type State<
    Product extends GeneratedRoomOS.ProductTarget,
    Subscriptions extends FeedbackSubscriptions<Product> = never,
  > = FeedbackStateFromSubscriptions<
    ConfigurationState<Product>,
    Subscriptions
  > &
    FeedbackStateFromSubscriptions<StatusState<Product>, Subscriptions>;

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
