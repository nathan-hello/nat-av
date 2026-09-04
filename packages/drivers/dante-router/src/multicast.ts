import * as dgram from "node:dgram";

export interface MulticastGroup {
  addr: string;
  port: number;
}

export interface MulticastOptions {
  groups: MulticastGroup[];
  interfaceIp?: string;
  onMessage: (data: Buffer, rinfo: dgram.RemoteInfo) => void;
  onError?: (error: Error) => void;
}

export class MulticastSocket {
  private socket: dgram.Socket | null = null;
  private opts: MulticastOptions;
  private started = false;

  constructor(opts: MulticastOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket = socket;

    socket.on("message", (data, rinfo) => {
      this.opts.onMessage(data, rinfo);
    });

    socket.on("error", (error) => {
      this.opts.onError?.(error);
    });

    if (this.opts.groups.length > 0) {
      const port = this.opts.groups[0].port;
      socket.bind(port, () => {
        for (const group of this.opts.groups) {
          try {
            const iface = this.opts.interfaceIp || "0.0.0.0";
            socket.addMembership(group.addr, iface);
          } catch {
            // addMembership may fail if interface doesn't exist
          }
        }
      });
    } else {
      socket.bind();
    }
  }

  send(data: Buffer, addr: string, port: number): void {
    if (!this.socket) return;
    this.socket.send(data, port, addr);
  }

  stop(): void {
    this.started = false;
    if (!this.socket) return;
    for (const group of this.opts.groups) {
      try {
        const iface = this.opts.interfaceIp || "0.0.0.0";
        this.socket.dropMembership(group.addr, iface);
      } catch {
        // dropMembership may fail
      }
    }
    this.socket.close();
    this.socket = null;
  }
}
