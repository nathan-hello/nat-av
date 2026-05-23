import { Driver } from "@av/driver";
import type { TOutput } from "./types";
import type { Sockets, Schema } from "@av/types";
import { createProxy } from "./proxy";

export default class CiscoRoomOS<
  T extends TOutput,
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
    // TSAS: TODO: Implement schema.
    return [] as unknown as Schema.Schema<this>;
  };

  state = {};
  get api() {
    return {
      xCommand: createProxy("xCommand", this.output),
    };
  }
}

const asdf = new CiscoRoomOS({
  name: "asdf",
  // TSAS:
  socket: "" as any,
  output: { type: "http", getSessionId: () => "asdf" },
});

const fdsa = asdf.api.xCommand.Message.Send({ num: 123 });
