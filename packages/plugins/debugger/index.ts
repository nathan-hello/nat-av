import { Err, Natav } from "@nat-av/core";
import type { Events } from "@nat-av/core";

type SerializableMessage = Omit<Events.Natav.SocketMessage, "data"> & {
  data: number[];
};

type State = {
  view: Natav.DriverView[];
  messages: Record<Natav.Names, SerializableMessage[]>;
};

function buildState(nodes: Natav.DriverView[]): State {
  const messages: State["messages"] = {};

  const visit = (node: Natav.DriverView) => {
    messages[node.name] ??= [];
    for (const child of node.deps) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return { view: nodes, messages };
}

export default class Debugger extends Natav.Plugin<"debugger"> {
  natav: Natav.ManagerView;
  state: State = {
    view: [],
    messages: {},
  };

  api = {
    clear: (name: Natav.Names) => {
      if (this.state.messages[name]) {
        this.state.messages[name] = [];
      }
    },
    getNode: (name: Natav.Names): Natav.DriverView => {
      const found = this.findNode(this.state.view, name);
      if (!found) {
        throw new Error("node not found", {
          cause: Err.Codes.RpcInvalidRequestObject,
        });
      }
      return found;
    },
    tree: (): Natav.DriverView[] => {
      return this.natav.GetTree();
    },
    socket: {
      write: this.writeSocket,
    },
  };

  constructor(natav: Natav.ManagerView) {
    super({ name: "debugger" });
    this.natav = natav;
  }

  public override start() {
    this.state = buildState(this.natav.GetTree());
    this.dispatch("driver:state-updated", { data: this.state });
    this.subscribe();
  }

  private findNode(
    nodes: Natav.DriverView[],
    name: string,
  ): Natav.DriverView | undefined {
    for (const node of nodes) {
      if (node.name === name) return node;
      const found = this.findNode(node.deps, name);
      if (found) return found;
    }
    return undefined;
  }

  private subscribe() {
    this.natav.bus.on("natav:debug:socket", (event) => {
      const entry: SerializableMessage = {
        encoding: event.data.encoding,
        direction: event.data.direction,
        time: event.data.time,
        traceName: event.data.traceName,
        data: Array.from(event.data.data),
      };

      this.state.messages[event.name] ??= [];
      this.state.messages[event.name].push(entry);
      this.dispatch("driver:state-updated", { data: this.state });
    });
  }

  private async writeSocket(params: {
    name: Natav.Names;
    text: string | Uint8Array;
    encoding?: BufferEncoding;
  }): Promise<{ bytesWritten: number }> {
    if (!params || typeof params !== "object") {
      throw new Error("Invalid debug socket write params", {
        cause: Err.Codes.RpcInvalidParams,
      });
    }

    if (typeof params.name !== "string" || typeof params.text !== "string") {
      throw new Error(
        "Debug socket write requires string driverName and text",
        {
          cause: Err.Codes.RpcInvalidParams,
        },
      );
    }

    const result = await this.tel.task("debugger:socket-write", async () => {
      const driver = this.natav.FindDriver(params.name);
      if (!driver) {
        throw new Error(
          `Natav.Driver "${params.name}" not found in ${this.natav.GetAllDriverNames()}`,
          {
            cause: Err.Codes.DriverNotFound,
          },
        );
      }

      const socket = driver.socket;
      if (
        !socket ||
        !("write" in socket) ||
        typeof socket.write !== "function"
      ) {
        throw new Error(
          `Natav "${params.name}" does not expose a writable socket`,
          {
            cause: Err.Codes.RpcMethodNotFound,
          },
        );
      }

      const bytesWritten = await socket.write(params.text);
      return { bytesWritten };
    });

    if (result.ok) {
      return result.data;
    }

    throw result.error;
  }
}
