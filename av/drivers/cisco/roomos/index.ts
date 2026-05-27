import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { createProxy } from "@av/drivers/cisco/roomos/proxy";
import type { RoomOS, Generated } from "@av/drivers/cisco/roomos/types";

export default class CiscoRoomOS<
  Product extends Generated.ProductTarget = "any",
  const Subscriptions extends RoomOS.FeedbackSubscriptions<Product> = never,
  const N extends string = string,
> extends Driver<N> {
  schema = undefined;
  socket: Sockets.Socket;
  output: RoomOS.Format;

  constructor({
    name,
    socket,
    subscriptions,
    output,
  }: {
    name: N;
    socket: Sockets.Socket;
    product?: Product;
    subscriptions?: Subscriptions & RoomOS.FeedbackSubscriptions<Product>;
    output: RoomOS.Format;
  }) {
    super({ name, driverName: "cisco-room-devices-11-9" });
    this.socket = socket;
    this.output = output;
  }

  // TSAS: The initial state is populated asynchronously from feedback subscriptions.
  state: RoomOS.State<Product, Subscriptions> = {} as RoomOS.State<
    Product,
    Subscriptions
  >;

  get api(): RoomOS.Api<Product, RoomOS.State<Product, Subscriptions>> {
    return {
      xCommand: createProxy("xCommand", this.output),
      xConfiguration: createProxy("xConfiguration", this.output),
      xStatus: createProxy("xStatus", this.output),
      xFeedback: createProxy("xFeedback", this.output),
    };
  }
}
