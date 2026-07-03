import { Err } from "@av/client";
import { Driver } from "@av/drivers";
import { type Drivers, type Events } from "@av/types";

type SerializableMessage = Omit<Events.Natav.SocketMessage, "data"> & {
  data: number[];
};

type State = {
  view: Drivers.DriverView[];
  messages: Record<Drivers.Names, SerializableMessage[]>;
};

function buildState(nodes: Drivers.DriverView[]): State {
  const messages: State["messages"] = {};

  const visit = (node: Drivers.DriverView) => {
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

export class Debugger extends Driver<"debugger"> {
  natav: Drivers.ManagerView;
  state: State = {
    view: [],
    messages: {},
  };

  api = {
    clear: (name: Drivers.Names) => {
      if (this.state.messages[name]) {
        this.state.messages[name] = [];
      }
    },
    getNode: (name: Drivers.Names): Drivers.DriverView => {
      const found = this.findNode(this.state.view, name);
      if (!found) {
        throw new Error("node not found", {
          cause: Err.Codes.RpcInvalidRequestObject,
        });
      }
      return found;
    },
    tree: (): Drivers.DriverView[] => {
      return this.natav.GetTree();
    },
    socket: {
      write: this.writeSocket,
    },
  };

  constructor(natav: Drivers.ManagerView) {
    super({ name: "debugger" });
    this.natav = natav;
  }

  public override start() {
    this.state = buildState(this.natav.GetTree());
    this.dispatch("driver:state-updated", { data: this.state });
    this.subscribe();
  }

  private findNode(
    nodes: Drivers.DriverView[],
    name: string,
  ): Drivers.DriverView | undefined {
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
    name: Drivers.Names;
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
          `Driver "${params.name}" not found in ${this.natav.GetAllDriverNames()}`,
          {
            cause: Err.Codes.DriverNotFound,
          },
        );
      }

      if (typeof driver.socket?.write !== "function") {
        throw new Error(
          `Drivers "${params.name}" does not expose a writable socket`,
          {
            cause: Err.Codes.RpcMethodNotFound,
          },
        );
      }

      const bytesWritten = await driver.socket.write(params.text);
      return { bytesWritten };
    });

    if (result.ok) {
      return result.data;
    }

    throw result.error;
  }
}
