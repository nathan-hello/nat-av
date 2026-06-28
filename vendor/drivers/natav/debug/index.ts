import { Err } from "@av/client";
import { Driver } from "@av/drivers";
import { type Drivers, type Events } from "@av/types";

type SerializableMessage = Omit<Events.Natav.SocketMessage, "data"> & {
  data: number[];
};

type State = {
  tree: Record<
    Drivers.Names,
    { meta: Drivers.DriverView; messages: SerializableMessage[] }
  >;
};

function buildTree(nodes: Drivers.DriverView[]): State["tree"] {
  const tree: State["tree"] = {};

  const visit = (node: Drivers.DriverView) => {
    tree[node.name] ??= {
      meta: node,
      messages: [],
    };

    for (const child of node.deps) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return tree;
}

export class Debugger extends Driver<"debugger"> {
  natav: Drivers.ManagerView;
  state: State = {
    tree: {},
  };

  api = {
    clear: (name: Drivers.Names) => {
      if (this.state.tree[name]) {
        this.state.tree[name].messages = [];
      }
    },
    getNode: (name: Drivers.Names): Drivers.DriverView => {
      const found = this.state.tree[name]?.meta;
      if (!found) {
        throw new Error("node not found", {
          cause: Err.Codes.InvalidRequest,
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
    this.state.tree = buildTree(this.natav.GetTree());
    this.subscribe();
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

      const current = this.state.tree[event.name];
      if (!current) {
        this.state.tree[event.name] = {
          meta: this.api.getNode(event.name),
          messages: [entry],
        };
        return;
      }

      current.messages.push(entry);
    });
  }

  private async writeSocket(params: {
    name: Drivers.Names;
    text: string | Uint8Array;
    encoding?: BufferEncoding;
  }): Promise<{ bytesWritten: number }> {
    if (!params || typeof params !== "object") {
      throw new Error("Invalid debug socket write params", {
        cause: Err.Codes.InvalidParams,
      });
    }

    if (typeof params.name !== "string" || typeof params.text !== "string") {
      throw new Error(
        "Debug socket write requires string driverName and text",
        {
          cause: Err.Codes.InvalidParams,
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
            cause: Err.Codes.MethodNotFound,
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
