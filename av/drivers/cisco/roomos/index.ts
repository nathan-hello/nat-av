import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { RoomOSProxy } from "@av/drivers/cisco/roomos/proxy";
import type { RoomOS, Generated } from "@av/drivers/cisco/roomos/types";
import { RequestManager } from "@av/lib/requests";
import { RoomOSFormatter } from "@av/drivers/cisco/roomos/writer";
import { Delimiters } from "@av/sockets/delimiters";
import { RPCErrorData } from "@av/rpc/protocol";

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
    super({ name, driverName: "cisco-room-devices-11-9" });
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

    return result.data;
  }

  // TSAS: The initial state is populated asynchronously from feedback subscriptions.
  state: State<Product, Subscriptions> = {} as State<Product, Subscriptions>;

  api: RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>> = {
    xCommand: RoomOSProxy.Command(this.request.bind(this)),
    xConfiguration: RoomOSProxy.Configuration(this.request.bind(this)),
    xStatus: RoomOSProxy.Status(this.request.bind(this)),
    xFeedback: RoomOSProxy.Feedback(this.request.bind(this)),
  };
}
