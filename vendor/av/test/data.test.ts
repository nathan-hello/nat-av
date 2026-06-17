import { Driver as NDriver } from "@av/drivers";
import { toBuffer } from "@av/lib/convert";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import type {
  ServerRpcTransportEvents,
  ServerRpcTransport as ServerRpcTransportShape,
} from "@av/rpc/server/websocket";
import { Telemetry } from "@av/telemetry";
import type { Events, Rpc, Schema, Sockets } from "@av/types";

export namespace Test {
  export async function AwaitNextMicrotask(n: number = 1) {
    const promises = Array.from({ length: n }).map(
      () => new Promise((resolve) => setImmediate(resolve)),
    );

    for (const p of promises) {
      await p;
    }
  }

  class RpcServerTransport
    extends TypedEventTarget<ServerRpcTransportEvents>
    implements ServerRpcTransportShape
  {
    listen() {}

    open(peer: Rpc.WebSocket.Peer) {
      this.dispatch("open", { peer });
    }

    message(peer: Rpc.WebSocket.Peer, data: string) {
      this.dispatch("message", { peer, data });
    }

    close(peer: Rpc.WebSocket.Peer, code: number, reason: string) {
      this.dispatch("close", { peer, code, reason });
    }

    error(peer: Rpc.WebSocket.Peer) {
      this.dispatch("error", { peer });
    }
  }

  export class RpcTransport
    extends TypedEventTarget<WebSocketEventMap>
    implements ClientRpcTransport
  {
    readyState: number = WebSocket.CLOSED;
    sent: string[] = [];
    received: string[] = [];
    server = new RpcServerTransport();
    private peer: Rpc.WebSocket.Peer;

    constructor() {
      super();
      const transport = this;
      this.peer = {
        addr: "in-memory",
        get readyState() {
          return transport.readyState;
        },
        send: (message: string) => {
          this.receive(message);
        },
        close: (code?: number, reason?: string) => {
          this.close(code, reason);
        },
      };
    }

    connect() {
      this.readyState = WebSocket.OPEN;
      this.dispatch("open", new Event("open"));
      this.server.open(this.peer);
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
      this.server.close(this.peer, code ?? 1000, reason ?? "");
    }

    send(message: string) {
      this.sent.push(message);
      this.server.message(this.peer, message);
    }

    private receive(message: string) {
      this.received.push(message);
      this.dispatch("message", new MessageEvent("message", { data: message }));
    }
  }

  export class Driver<const N extends string = string> extends NDriver<N> {
    state = {
      connected: false,
      lastFrame: "init",
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
      super({ name });
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
      super({ name });
    }

    emitTick(count: number) {
      this.events.dispatch("tick", { count });
    }
  }

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
