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

type ApiRecordify<Value> =
  Value extends (...args: any[]) => any ? Value
  : IsPlainObject<Value> extends true ?
    { [K in keyof Value]: ApiRecordify<Value[K]> } & Drivers.ApiRecord
  : never;

export type { GeneratedRoomOS as Generated };

export namespace RoomOS {
  export type ConfigurationState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.ConfigurationState<Product>;

  export type StatusState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.StatusState<Product>;

  export type FeedbackState<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = GeneratedRoomOS.FeedbackState<Product>;

  export type FeedbackSubscriptions<
    Product extends GeneratedRoomOS.ProductTarget,
  > = FeedbackSubscriptionsFor<FeedbackState<Product>>;

  export type State<
    Product extends GeneratedRoomOS.ProductTarget,
    Subscriptions extends FeedbackSubscriptions<Product> = never,
  > = FeedbackState<Product>;

  export type ConfigurationApi<
    Product extends GeneratedRoomOS.ProductTarget = "any",
  > = ApiRecordify<Configify<ConfigurationState<Product>>>;

  export type StatusApi<Product extends GeneratedRoomOS.ProductTarget = "any"> =
    ApiRecordify<Statusify<StatusState<Product>>>;

  export type Api<
    Product extends GeneratedRoomOS.ProductTarget = "any",
    State = FeedbackState<Product>,
  > = {
    xCommand: ApiRecordify<GeneratedRoomOS.CommandApi<Product>>;
    xConfiguration: ConfigurationApi<Product>;
    xStatus: StatusApi<Product>;
    xFeedback: ApiRecordify<Feedbackify<FeedbackState<Product>, State>>;
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

  export type ReadOperation = {
    update: {
      path: readonly string[];
      value: unknown;
    }[];
  };

  export type HeldSubscriptions = {
    path: readonly string[];
    id: number;
  };
}
