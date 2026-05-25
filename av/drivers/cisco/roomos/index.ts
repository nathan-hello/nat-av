import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { createProxy } from "@av/drivers/cisco/roomos/proxy";
import type {
  RoomOSApi,
  RoomOSFeedbackSubscriptions,
  RoomOSProductTarget,
  RoomOSRoot,
  RoomOSState,
  TOutput,
} from "@av/drivers/cisco/roomos/types";

export default class CiscoRoomOS<
  Product extends RoomOSProductTarget = "any",
  const Subscriptions extends readonly (readonly string[])[] = readonly [],
  const N extends string = string,
  T extends TOutput = TOutput,
> extends Driver<N> {
  schema = undefined;
  socket: Sockets.Socket;
  output: T;

  constructor({
    name,
    socket,
    subscriptions,
    output,
  }: {
    name: N;
    socket: Sockets.Socket;
    product?: Product;
    subscriptions?: Subscriptions & RoomOSFeedbackSubscriptions<Product, Subscriptions>;
    output: T;
  }) {
    super({ name, driverName: "cisco-room-devices-11-9" });
    this.socket = socket;
    this.output = output;
  }

  // TSAS: The initial state is populated asynchronously from feedback subscriptions.
  state: RoomOSState<Product, Subscriptions> = {} as RoomOSState<Product, Subscriptions>;

  get api(): RoomOSApi<Product, RoomOSState<Product, Subscriptions>> {
    const createRootProxy = <Root extends RoomOSRoot>(root: Root) =>
      createProxy<Root, T, Product>(root, this.output);

    // TSAS: The recursive proxy tree matches the generated RoomOS API surface.
    return {
      xCommand: createRootProxy("xCommand"),
      xConfiguration: createRootProxy("xConfiguration"),
      xStatus: createRootProxy("xStatus"),
      xFeedback: createRootProxy("xFeedback"),
    };
  }
}
