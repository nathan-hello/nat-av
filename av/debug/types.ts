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
  direction: "rx" | "tx";
  time: string;
  traceName: string;
  encoding: SocketDebugEncoding;
  text: string;
  hex: string;
  length?: number;
};

export type DebugSocketWriteResult = {
  bytesWritten: number;
};
