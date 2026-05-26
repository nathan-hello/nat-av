import type { Events, Rpc, Schema } from "@av/types";
import { Driver } from "@av/drivers";
import { Tcp } from "@av/sockets/tcp";
import { ConsoleExporter } from "@av/telemetry/exporters";
import { StartLogging } from "@av/telemetry/sdk";
import { Orchistrator } from "@av/lib/orch";
import { Bus } from "@av/lib/bus";

StartLogging([new ConsoleExporter()]);

export class TestDriver<const N extends string = string> extends Driver<N> {
  state = {
    connected: false,
    lastFrame: "",
  };

  socket: Tcp;

  api = {
    ping: async () => "pong",
    send: async (message: string) =>
      this.socket.write(Buffer.from(message, "utf8")),
    invalid: async (cb: () => void) => {
      return new Date();
    },
  };

  schema = (): Schema.Schema<TestDriver> => {
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
      this.dispatch("driver:state-updated", {
        data: {
          connected: this.state.connected,
        },
      });
    });

    socket.on("disconnected", () => {
      this.state.connected = false;
      this.dispatch("driver:state-updated", {
        data: {
          connected: this.state.connected,
        },
      });
    });

    socket.on("receive", (chunk) => {
      this.state.lastFrame = chunk.toString("utf8");
      this.dispatch("driver:state-updated", {
        data: {
          lastFrame: this.state.lastFrame,
        },
      });
    });
  }
}

export const driver = new TestDriver({
  name: "shim-1",
  socket: new Tcp({ addr: "127.0.0.1", port: 12345, keepAlive: true }),
});

export const natav = new Orchistrator([driver]);

export type natav = typeof natav;

export class TestSystem {
  private natav: natav;

  constructor(args: { natav: natav }) {
    this.natav = args.natav;
  }

  api = {
    asdf: () => {
      return null;
    },
    fdsa: () => {
      return null;
    },
  };

  get state() {
    return null;
  }
}

const bus = new Bus<natav>();

export class AutomationEngine {
  constructor() {
    bus.on("natav:state:update", (update) => {
      this.handleStateChange(update);
    });
  }

  private handleStateChange(
    data: Events.System.Map<natav>["natav:state:update"],
  ): void {
    switch (data.name) {
      case "shim-1":
        break;
    }
  }
}

export const system = new TestSystem({ natav });

type Api = Rpc.Api<natav, "shim-1">;
