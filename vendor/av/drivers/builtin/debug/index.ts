import { Driver } from "@av/drivers";
import { Rpc, type Drivers, type Events } from "@av/types";

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

    for (const child of node.children) {
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
        this.tel.error("node not found", { name });
        throw new Rpc.Error({
          code: Rpc.Error.Codes.InvalidRequest,
          message: "node not found",
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
    super({ name: "debugger", driverName: "debugger" });
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
      throw new Rpc.Error({
        code: Rpc.Error.Codes.InvalidParams,
        message: "Invalid debug socket write params",
      });
    }

    if (typeof params.name !== "string" || typeof params.text !== "string") {
      throw new Rpc.Error({
        code: Rpc.Error.Codes.InvalidParams,
        message: "Debug socket write requires string deviceName and text",
      });
    }

    const result = await this.tel.task("debugger:socket-write", async () => {
      const device = this.natav.FindDriver(params.name);
      if (!device) {
        throw new Rpc.Error({
          code: Rpc.Error.Codes.DeviceNotFound,
          message: `Device "${params.name}" not found`,
          data: { availableDevices: this.natav.GetAllDriverNames() },
        });
      }

      if (typeof device.socket?.write !== "function") {
        throw new Rpc.Error({
          code: Rpc.Error.Codes.MethodNotFound,
          message: `Device "${params.name}" does not expose a writable socket`,
        });
      }

      const bytesWritten = await device.socket.write(params.text);
      return { bytesWritten };
    });

    if (result.ok) {
      return result.data;
    }

    throw new Rpc.Error({
      code: Rpc.Error.Codes.InternalError,
      message: result.error,
    });
  }
}
