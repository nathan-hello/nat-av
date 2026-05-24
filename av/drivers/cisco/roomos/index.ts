import { Driver } from "@av/driver";
import type { Sockets, Schema } from "@av/types";
import { createProxy } from "@av/drivers/cisco/roomos/proxy";
import type {
  RoomOSApi,
  RoomOSProductTarget,
  RoomOSRoot,
  TMapReturn,
  TOutput,
} from "@av/drivers/cisco/roomos/types";

export default class CiscoRoomOS<
  T extends TOutput,
  Product extends RoomOSProductTarget = "any",
  const N extends string = string,
> extends Driver<N> {
  socket: Sockets.Socket;
  output: T;

  constructor({
    name,
    socket,
    output,
  }: {
    name: N;
    socket: Sockets.Socket;
    output: T;
  }) {
    super({ name, driverName: "cisco-room-devices-11-9" });
    this.socket = socket;
    this.output = output;
  }

  schema = (): Schema.Schema<this> => {
    // TSAS: The schema is intentionally deferred; the empty tree satisfies the readonly array shape.
    return [] as unknown as Schema.Schema<this>;
  };

  state: Record<string, never> = {};

  get api() {
    const createRootProxy = <Root extends RoomOSRoot>(root: Root) =>
      createProxy<Root, T, Product>(root, this.output);

    // TSAS: The recursive proxy tree matches the generated RoomOS API surface.
    return {
      xCommand: createRootProxy("xCommand"),
      xConfiguration: createRootProxy("xConfiguration"),
      xStatus: createRootProxy("xStatus"),
      xFeedback: createRootProxy("xFeedback"),
    } as unknown as RoomOSApi<Product, TMapReturn<T["type"]>>;
  }
}

const asdf = new CiscoRoomOS({name: "asdf", output: {} as unknown as TOutput, socket: {} as unknown as Sockets.Socket});

asdf.api.xCommand.Call.Hold({});
