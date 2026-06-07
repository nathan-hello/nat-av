import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { RoomOSProxy } from "@av/drivers/cisco/roomos/proxy";
import { RoomOS, type Generated } from "@av/drivers/cisco/roomos/types";
import { RequestManager } from "@av/lib/requests";
import { RoomOSFormatter } from "@av/drivers/cisco/roomos/writer";
import { Delimiters } from "@av/sockets/delimiters";
import { RPCError, RPCNotification, RPCResponse } from "@av/rpc/protocol";
import { toBuffer, toString } from "@av/lib/buffer";
import { reader } from "@av/drivers/cisco/roomos/reader";

export type State<
  Product extends Generated.ProductTarget = "any",
  Subscriptions extends RoomOS.FeedbackSubscriptions<Product> = never,
> = RoomOS.State<Product, Subscriptions> & {
  internal: { subscriptions: Subscriptions };
};

export class CiscoRoomOS<
  Product extends Generated.ProductTarget = "any",
  const Subscriptions extends RoomOS.FeedbackSubscriptions<Product> = never,
  const N extends string = string,
> extends Driver<N> {
  private requests: RequestManager<
    RoomOS.WriteOperation & { id: number },
    unknown
  >;
  private highestId = 0;
  private proxy = new RoomOSProxy(this.tel, this.request.bind(this));
  private subscriptions: RoomOS.HeldSubscription[] = [];

  state = this.proxy.State() as RoomOS.State<Product, Subscriptions> & {
    internal: { highestId: number; subscriptions: Subscriptions };
  };
  schema = undefined;
  socket: Sockets.Client;

  constructor({
    name,
    socket,
    subscriptions,
  }: {
    name: N;
    socket: Sockets.Client;
    product?: Product;
    subscriptions?: Subscriptions & RoomOS.FeedbackSubscriptions<Product>;
  }) {
    super({ name, driverName: "cisco-room-devices" });
    this.socket = socket;

    this.requests = new RequestManager({
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
          message.id === request.id,
        maxInFlight: 5,
        minGapMs: 10,
      },
      delimiter: Delimiters.json,
    });

    this.socket.on("connected", () => {
      this.socket.write("xPreferences OutputMode json\r");
    });

    this.requests.on("delimited", (message) => {
      this.dispatch("driver:delimited", toBuffer(message));
      const notification = RPCNotification.is(message);
      if (notification) {
        const read = reader.JsonRpc.Notification(notification);
        this.tel.debug("READ_NOTIFICATION", { read });
        if (read) {
          this.read(read);
        }
      }
    });

    this.state.internal = {
      highestId: this.highestId,
      // TSAS:
      subscriptions: subscriptions as typeof this.state.internal.subscriptions,
    };
  }

  private read(operation: RoomOS.ReadOperation): RoomOS.Result<unknown> {
    this.tel.info("READ_OPERATION", operation);
    switch (operation.kind) {
      case "update":
        this.tel.info("UPDATE_STATE", operation);
        this.proxy.UpdateState(operation.data.path, operation.data.value);
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

  private async request(
    operation: RoomOS.WriteOperation,
  ): Promise<RoomOS.Result<unknown>> {
    this.tel.info("REQUEST", { op: operation, id: this.highestId + 1 });

    const rx = await this.requests.request({
      ...operation,
      id: this.highestId++,
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

    const err = RPCError.is(rx.data);
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

    const resp = RPCResponse.is(rx.data);
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

  api: RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>> = {
    xCommand: this.proxy.Command() as RoomOS.Api<
      Product,
      RoomOS.State<Product, Subscriptions>
    >["xCommand"],
    xConfiguration: this.proxy.Configuration() as RoomOS.Api<
      Product,
      RoomOS.State<Product, Subscriptions>
    >["xConfiguration"],
    xStatus: this.proxy.Status() as RoomOS.Api<
      Product,
      RoomOS.State<Product, Subscriptions>
    >["xStatus"],
    xFeedback: this.proxy.Feedback() as RoomOS.Api<
      Product,
      RoomOS.State<Product, Subscriptions>
    >["xFeedback"],
  };
}
