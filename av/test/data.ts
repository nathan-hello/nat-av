import { Driver } from "../driver";
import Natav from "../natav";
import { Tcp } from "../sockets/tcp";
import { SchemaGenerator } from "../schema/index.ts";
import { CustomExporter, MultiLogExporter } from "../tools/telemetry/exporters";
import { StartLogging } from "../tools/telemetry/sdk";

StartLogging(new MultiLogExporter([new CustomExporter(() => {})]));

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
  [],
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
  socket: new Tcp({ addr: "127.0.0.1", port: 12345 }),
});

export const natav = new Natav([driver]);

export const schema = new SchemaGenerator({ entryFile: import.meta.url, exportName: "natav" });
