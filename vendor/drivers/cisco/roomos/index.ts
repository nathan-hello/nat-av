import {
  Delimiters,
  Driver,
  RequestManager,
  Rpc,
  toBuffer,
  toString,
  TypedEventTarget,
  type Format,
  type Sockets,
} from "@av/index";
import { RoomOSProxy } from "./proxy";
import { reader } from "./reader";
import type { JsonValue } from "./typegen/scripts/types";
import { RoomOS } from "./types";
import { RoomOSFormatter } from "./writer";

export type State<
  Product extends RoomOS.ProductTarget = "any",
  StrictState extends boolean = boolean,
  Subscriptions extends RoomOS.Sub<Product> = RoomOS.Sub<Product>,
> = RoomOS.State<Product, Subscriptions, StrictState> & {
  internal: { subscriptions: Subscriptions };
};

export class CiscoRoomOS<
  Product extends RoomOS.ProductTarget = "any",
  const Strict extends boolean = true,
  const Sub extends RoomOS.Sub<Product> = RoomOS.Sub<Product>,
  const N extends string = string,
> extends Driver<N> {
  private requests: RequestManager<
    RoomOS.WriteOperation & { id: number },
    Format.JsonRpc.Response | Format.JsonRpc.Notification
  >;
  private proxy!: RoomOSProxy;
  private subscriptions: RoomOS.HeldSubscription[] = [];
  events = new TypedEventTarget<RoomOS.SubscribedEventMap<Product, Sub>>();

  state: RoomOS.State<Product, Sub, Strict> & {
    internal: { highestId: number; subscriptions: Sub };
  };

  socket: Sockets.Client;

  constructor({
    name,
    socket,
    subscriptions,
    strict,
  }: {
    name: N;
    socket: Sockets.Client;
    product?: Product;
    subscriptions?: RoomOS.Sub<Product> & Sub;
    strict: Strict;
  }) {
    super({ name, driverName: "cisco-room-devices" });
    this.socket = socket;

    this.proxy = new RoomOSProxy(this.tel, this.request.bind(this), {}, strict);

    // TSAS: The proxy returns the runtime state surface, which is narrowed by the generic State type.
    this.state = this.proxy.State() as RoomOS.State<Product, Sub, Strict> & {
      internal: { highestId: number; subscriptions: Sub };
    };

    this.requests = new RequestManager<
      RoomOS.WriteOperation & { id: number },
      Format.JsonRpc.Response | Format.JsonRpc.Notification
    >({
      socket,
      tel: this.tel,
      formatter: (operation) => {
        return Buffer.from(RoomOSFormatter.ToJsonRpc(operation, operation.id));
      },
      responseStrategy: {
        strategy: "match",
        matchFn: (request, message) =>
          typeof message === "object" &&
          message !== null &&
          "id" in message &&
          request !== null &&
          typeof request === "object" &&
          "id" in request &&
          message.id === request.id,
        maxInFlight: 5,
        minGapMs: 10,
      },
      delimiter: Delimiters.json<
        Format.JsonRpc.Response | Format.JsonRpc.Notification
      >,
    });

    this.socket.on("connected", async () => {
      this.socket.write("xPreferences OutputMode json\r");
      await Promise.all(
        this.RefeshSubscriptions(this.state.internal.subscriptions),
      );
    });

    this.requests.on("delimited", (message) => {
      this.dispatch("driver:delimited", toBuffer(message));
      const notification = Rpc.Notification.is(message);
      if (notification) {
        const read = reader.JsonRpc.Notification(notification);
        this.tel.debug("READ_NOTIFICATION", { read });
        if (read) {
          this.read(read);
        }
      }
    });

    this.state.internal = {
      highestId: 0,
      // TSAS:
      subscriptions: subscriptions as typeof this.state.internal.subscriptions,
    };

    this.initApi();
  }

  private read(operation: RoomOS.ReadOperation): RoomOS.Result<unknown> {
    this.tel.info("READ_OPERATION", operation);
    switch (operation.kind) {
      case "update":
        this.tel.info("UPDATE_STATE", operation);
        this.proxy.UpdateState(operation.data.path, operation.data.value);

        if (operation.data.path[0] === "Event") {
          const eventName = operation.data.path.slice(1).join(" ");
          // TSAS: Event notifications are emitted from schema-backed Event paths.
          const typedEventName = eventName as keyof RoomOS.SubscribedEventMap<
            Product,
            Sub
          > &
            string;
          // TSAS: The emitted payload is stored at the same schema-backed event path.
          const typedEventPayload = operation.data
            .value as RoomOS.SubscribedEventMap<
            Product,
            Sub
          >[typeof typedEventName];

          this.events.dispatch(typedEventName, typedEventPayload);
        }

        return { ok: true, data: operation.data.value };
      case "unsubscribed":
        this.subscriptions = this.subscriptions.filter(
          (s) => !operation.data.find((d) => d.id === s.id),
        );
        return { ok: true, data: operation.data };
      case "subscribed":
        if (Array.isArray(operation.data)) {
          operation.data.forEach((op) => this.subscriptions.push(op));
          break;
        }
        this.subscriptions.push(operation.data);
        return { ok: true, data: operation.data };
      case "error":
        return { ok: false, error: operation.data };
      case "command_response":
        return { ok: true, data: operation.data };
    }
    return {
      ok: false,
      error: {
        code: RoomOS.ErrorCodes.INVALID_READ_OPERATION,
        data: operation,
        message: "INVALID_READ_OPERATION",
      },
    };
  }

  private RefeshSubscriptions(
    subscriptions: Sub | NonNullable<JsonValue>,
    path: string[] = [],
  ): Promise<RoomOS.Result<unknown>>[] {
    const requests: Promise<RoomOS.Result<unknown>>[] = [];

    if (!subscriptions || typeof subscriptions !== "object") {
      return requests;
    }

    for (const [key, value] of Object.entries(subscriptions)) {
      const nextPath = [...path, key];

      if (value === true) {
        const root = nextPath[0];
        if (
          root === "xConfiguration" ||
          root === "xStatus" ||
          root === "xFeedback"
        ) {
          requests.push(
            this.request({
              kind: "sub",
              root,
              path: nextPath,
            }),
          );
        }
        continue;
      }

      if (value && typeof value === "object") {
        requests.push(...this.RefeshSubscriptions(value, nextPath));
      }
    }

    return requests;
  }

  private async request(
    operation: RoomOS.WriteOperation,
  ): Promise<RoomOS.Result<unknown>> {
    this.tel.info("REQUEST", {
      op: operation,
      id: this.state.internal.highestId + 1,
    });

    const rx = await this.requests.request({
      ...operation,
      id: this.state.internal.highestId++,
    });

    this.tel.info("REQUEST_RESOLVED", rx);

    if (!rx.ok) {
      return {
        ok: false,
        error: {
          code: RoomOS.ErrorCodes.INVALID_WRITE_OPERATION,
          data: rx,
          message: toString(operation),
        },
      };
    }

    const err = Rpc.Error.is(rx.data);
    if (err) {
      return {
        ok: false,
        error: {
          code: err.error.code,
          message: err.error.message,
          data: operation,
        },
      };
    }

    const resp = Rpc.Response.is(rx.data);
    if (resp) {
      return this.read(
        reader.JsonRpc.Response(operation, resp.result, this.subscriptions),
      );
    }

    return {
      ok: false,
      error: {
        code: RoomOS.ErrorCodes.INVALID_RESPONSE,
        message: toString(rx),
        data: operation,
      },
    };
  }

  // TSAS:
  api!: RoomOS.Api<Product, RoomOS.State<Product, Sub, Strict>>;

  private initApi() {
    this.api = {
      // TSAS: These proxy builders are runtime-correct by construction and narrower than the structural proxy type.
      xCommand: this.proxy.Command() as unknown as RoomOS.Api<
        Product,
        RoomOS.State<Product, Sub, Strict>
      >["xCommand"],
      // TSAS: These proxy builders are runtime-correct by construction and narrower than the structural proxy type.
      xConfiguration: this.proxy.Configuration() as RoomOS.Api<
        Product,
        RoomOS.State<Product, Sub, Strict>
      >["xConfiguration"],
      // TSAS: These proxy builders are runtime-correct by construction and narrower than the structural proxy type.
      xStatus: this.proxy.Status() as RoomOS.Api<
        Product,
        RoomOS.State<Product, Sub, Strict>
      >["xStatus"],
      // TSAS: These proxy builders are runtime-correct by construction and narrower than the structural proxy type.
      xFeedback: this.proxy.Feedback() as RoomOS.Api<
        Product,
        RoomOS.State<Product, Sub, Strict>
      >["xFeedback"],
    };
  }
}
