import { Driver as NDriver } from "@av/drivers";
import { toBuffer } from "@av/lib/buffer";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import { RPCRequest } from "@av/rpc/protocol";
import type { RPCServer } from "@av/rpc/server";
import { Tcp } from "@av/sockets/tcp";
import { Telemetry } from "@av/telemetry";
import type { Events, Schema, Sockets } from "@av/types";

export namespace Test {
  export class RpcClient
    extends TypedEventTarget<WebSocketEventMap>
    implements ClientRpcTransport
  {
    readyState: number = WebSocket.CLOSED;
    sent: string[] = [];
    received: string[] = [];

    private server: RPCServer;
    private peer: {
      addr: string;
      readonly readyState: number;
      send(message: string): void;
      close(): void;
    };

    constructor(server: RPCServer) {
      super();
      this.server = server;
      this.peer = {
        addr: "in-memory",
        get readyState() {
          return 1;
        },
        send: (message: string) => {
          this.receive(message);
        },
        close: () => {
          this.close();
        },
      };
    }

    connect() {
      this.readyState = WebSocket.OPEN;
      this.dispatch("open", new Event("open"));
    }

    close(code?: number, reason?: string) {
      this.readyState = WebSocket.CLOSED;
      this.dispatch(
        "close",
        new CloseEvent("close", {
          code: code ?? 1000,
          reason: reason ?? "",
        }),
      );
    }

    send(message: string) {
      this.sent.push(message);

      const request = RPCRequest.is(message);
      if (!request) {
        throw new Error(`invalid rpc request: ${message}`);
      }

      void this.server.handleRequest(request, this.peer).then((response) => {
        this.peer.send(JSON.stringify(response));
      });
    }

    private receive(message: string) {
      this.received.push(message);
      this.dispatch("message", new MessageEvent("message", { data: message }));
    }
  }

  export class Driver<const N extends string = string> extends NDriver<N> {
    state = {
      connected: false,
      lastFrame: "",
    };

    socket: Sockets.Client;

    api = {
      ping: async () => "pong",
      send: async (message: string) =>
        this.socket.write(Buffer.from(message, "utf8")),
      invalid: async (_: () => void) => {
        return new Date();
      },
    };

    schema = (): Schema.Schema<Driver> => {
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

    constructor({ name, socket }: { name: N; socket: Sockets.Client }) {
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

  export class EventDriver<const N extends string = string> extends NDriver<N> {
    state = { ready: true };
    api = {};
    socket = undefined;
    schema = undefined;
    events = new TypedEventTarget<{ tick: { count: number } }>();

    constructor(name: N) {
      super({ name, driverName: "event-driver" });
    }

    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

  export const driver = new Driver({
    name: "shim-1",
    socket: new Tcp({
      addr: "127.0.0.1",
      port: 12345,
      keepAlive: true,
    }),
  });

  export type SocketScriptStep<State = unknown> = {
    onWrite: string | Uint8Array | Buffer;
    sendBack: unknown | ((state: State) => unknown);
  };

  export class Socket<State = unknown>
    extends TypedEventTarget<Events.Socket.Map>
    implements Sockets.Client
  {
    name = "test-socket";
    writes: Buffer[] = [];
    private script?: SocketScriptStep<State>[];
    config?: { throwIfWriteNotFound: boolean };
    state: State | undefined;
    tel: Telemetry;

    constructor(
      scripts?: SocketScriptStep<State>[],
      config?: { throwIfWriteNotFound: boolean },
    ) {
      super();
      this.script = scripts;
      this.config = config;
      this.tel = new Telemetry(`test-socket`);
    }

    start() {}
    end() {}

    write(data: string | Uint8Array | Buffer): number {
      const buffer = toBuffer(data);
      this.writes.push(buffer);

      this.tel.info("WROTE", {
        str: buffer.toString("utf8"),
        hex: buffer.toString("hex"),
      });

      if (this.script && this.script?.length > 0) {
        const index = this.script.findIndex((step) =>
          buffer.equals(toBuffer(step.onWrite)),
        );

        if (index === -1) {
          if (this.config?.throwIfWriteNotFound) {
            throw Error("unknown write received: " + data.toString("utf8"));
          }
          return buffer.length;
        }

        const [step] = this.script.splice(index, 1);

        if (typeof step.sendBack === "function") {
          this.receive(step.sendBack(this.state));
        } else {
          this.receive(step.sendBack);
        }
      }

      return buffer.length;
    }

    updateState(state: State) {
      this.state = state;
    }

    receive(message: unknown) {
      const buffer = toBuffer(message);
      this.dispatch("receive", buffer);
    }
  }
}
