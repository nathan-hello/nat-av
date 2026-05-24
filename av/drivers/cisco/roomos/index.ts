import { Driver } from "@av/drivers";
import type { Sockets } from "@av/types";
import { createProxy } from "@av/drivers/cisco/roomos/proxy";
import type {
  RoomOSApi,
  RoomOSProductTarget,
  RoomOSRoot,
  TMapReturn,
  TOutput,
} from "@av/drivers/cisco/roomos/types";

export default class CiscoRoomOS<
  Product extends RoomOSProductTarget = "any",
  const N extends string = string,
  T extends TOutput = TOutput,
> extends Driver<N> {
  schema = undefined;
  socket: Sockets.Socket;
  output: T;

  constructor({
    name,
    socket,
    output,
  }: {
    name: N;
    socket: Sockets.Socket;
    product?: Product;
    output: T;
  }) {
    super({ name, driverName: "cisco-room-devices-11-9" });
    this.socket = socket;
    this.output = output;
  }

  state: Record<string, never> = {};

  get api(): RoomOSApi<Product, TMapReturn<T["type"]>> {
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

const asdf = new CiscoRoomOS({
  name: "asdf",
  product: "any",
  output: {} as unknown as TOutput,
  socket: {} as unknown as Sockets.Socket, });

asdf.api.xCommand.Dial({Number: "12345"});

const foo1 = asdf.api.xConfiguration.Bluetooth.set({Allowed: "True", Enabled: "True"})
const foo2 = asdf.api.xConfiguration.Bluetooth.Allowed.set("True")
const foo3 = asdf.api.xConfiguration.Bluetooth.Allowed.get()
