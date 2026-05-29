import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { RoomOSProxy } from "@av/drivers/cisco/roomos/proxy";
import type { RoomOS, Generated } from "@av/drivers/cisco/roomos/types";
import { RequestManager } from "@av/lib/requests";
import { RoomOSFormatter } from "@av/drivers/cisco/roomos/writer";
import { Delimiters } from "@av/sockets/delimiters";
import { RPCErrorData } from "@av/rpc/protocol";
import { toBuffer } from "@av/lib/buffer";

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
  schema = undefined;
  socket: Sockets.Socket;
  requests: RequestManager<RoomOS.WriteOperation & { id: number }, unknown>;
  highestId = 0;
  private stateData: Record<string, unknown> = {};
  private proxy = new RoomOSProxy(this.request.bind(this));

  constructor({
    name,
    socket,
    subscriptions,
  }: {
    name: N;
    socket: Sockets.Socket;
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

    this.requests.on("delimited", (message) => {
      this.dispatch("driver:delimited", toBuffer(message));
    });

    this.state.internal = {
      // TSAS:
      subscriptions: subscriptions as typeof this.state.internal.subscriptions,
    };
  }

  private async request(operation: RoomOS.WriteOperation): Promise<unknown> {
    const result = await this.requests.request({
      ...operation,
      id: this.highestId++,
    });

    if (!result.ok) {
      throw new RPCErrorData({ code: 400, message: result.error });
    }

    this.dispatch("driver:delimited", Buffer.from(JSON.stringify(result.data)));

    if ("error" in result) {
      return {
        ok: false,
        error: result.error,
      };
    }

    if (
      typeof result.data === "object" &&
      (result.data === null || "result" in result.data)
    ) {
      return {
        ok: true,
        data: result.data ? result.data.result : null,
      };
    }
  }

  get state(): State<Product, Subscriptions> { return {} as State<Product, Subscriptions> }

  set state(value: State<Product, Subscriptions>) {
    this.stateData = value;
  }

  api: RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>> = {
    xCommand: this.proxy.Command() as RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>>["xCommand"],
    xConfiguration: this.proxy.Configuration() as RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>>["xConfiguration"],
    xStatus: this.proxy.Status() as RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>>["xStatus"],
    xFeedback: this.proxy.Feedback() as RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>>["xFeedback"],
  };
}
