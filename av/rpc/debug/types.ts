export type SocketDebugEncoding = "utf8";

export type DebugSocketDescriptor = {
  traceName: string;
  canWrite: boolean;
  canReceive: boolean;
};

export type DebugDeviceNode = {
  name: string;
  driverName: string;
  children: DebugDeviceNode[];
  socket?: DebugSocketDescriptor;
};

export type DebugSocketMessage = {
  device: string;
  direction: "rx" | "tx" | "rx-delimited";
  time: string;
  traceName: string;
  encoding: SocketDebugEncoding;
  text: string;
  hex: string;
  length: number;
};

export type DebugSocketEvent = {
  traceName: string;
  direction: "rx" | "tx" | "rx-delimited";
  time: string;
  encoding: SocketDebugEncoding;
  text: string;
  hex: string;
  length: number;
};

export type DebugSocketWriteResult = {
  bytesWritten: number;
};

export type DebugEntry = {
  time: string;
  context: {
    spanId: string | undefined;
    traceId: string | undefined;
    traceName: string;
  };
  severity: {
    id: number;
    text: string;
  };
  name: string;
  data: any;
};

export const DebugRpcMethods = {
  GetSchema: "debug.schema.get",
  GetTree: "debug.tree.get",
  WriteSocket: "debug.socket.write",
} as const;

export type DebugRpcNotification =
  | {
      type: "debug:log";
      entry: DebugEntry;
    }
  | {
      type: "debug:socket:message";
      message: DebugSocketMessage;
    };
