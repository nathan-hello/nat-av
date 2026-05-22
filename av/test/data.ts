import type { Schema } from "@av/types";
import { Driver } from "../driver";
import Natav from "../natav";
import { Tcp } from "../sockets/tcp";
import { ConsoleExporter } from "@av/telemetry/exporters";
import { StartLogging } from "@av/telemetry/sdk";

StartLogging([new ConsoleExporter()]);

export type TestShimState = {
  connected: boolean;
  lastFrame: string | null;
};

export type TestShimApi = {
  ping: () => Promise<string>;
  send: (message: string) => Promise<number>;
};

export class TestShim<const N extends string = string> extends Driver<
  N,
  {},
  "test-shim",
  TestShimApi,
  TestShimState,
  Tcp
> {
  state: TestShimState = {
    connected: false,
    lastFrame: null,
  };

  socket: Tcp;

  api: TestShimApi = {
    ping: async () => "pong",
    send: async (message: string) => this.socket.write(Buffer.from(message, "utf8")),
  };

  schema = (): Schema<typeof this.api> => {
    return [
      {
        name: "ping",
        returns: { type: "string" },
        args: [],
      },
      {
        name: "send",
        args: [{ type: "string" }],
        returns: { type: "number" },
      },
    ];
  };

  constructor({ name, socket }: { name: N; socket: Tcp }) {
    super({ name, driverName: "test-shim" });
    this.socket = socket;

    socket.on("connected", () => {
      this.state.connected = true;
      this.dispatch("driver:state-updated", { connected: this.state.connected });
    });

    socket.on("disconnected", () => {
      this.state.connected = false;
      this.dispatch("driver:state-updated", { connected: this.state.connected });
    });

    socket.on("receive", (chunk) => {
      this.state.lastFrame = chunk.toString("utf8");
      this.dispatch("driver:state-updated", { lastFrame: this.state.lastFrame });
    });
  }
}

export const driver = new TestShim({
  name: "shim-1",
  socket: new Tcp({ addr: "127.0.0.1", port: 12345, keepAlive: true }),
});

export const natav = new Natav([driver]);
