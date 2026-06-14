import { Telemetry } from "@av/telemetry";
import type { Events, Sockets } from "@av/types";
import * as dgram from "node:dgram";
import { TypedEventTarget } from "../lib/eventtarget";

const RETRY_DELAY = 5000;

export class Udp
  extends TypedEventTarget<Events.Socket.UdpMap>
  implements Sockets.Client
{
  private socket: dgram.Socket | undefined;
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private retrying = false;
  private stopped = true;
  private config: Sockets.Args.Udp;
  private tel: Telemetry;
  name: string;

  constructor(args: Sockets.Args.Udp) {
    const name = `Udp::${args.addr}:${args.port}`;
    const tel = new Telemetry(name);
    super();
    this.name = name;
    this.tel = tel;
    this.config = args;
    this.tel.info("INITALIZE", this.config);
  }

  private emit<EventName extends keyof Events.Socket.UdpMap>(
    event: EventName,
    payload: Events.Socket.UdpMap[EventName],
  ): void {
    this.dispatch(event, payload);
  }

  private handleData(buf: Buffer): void {
    this.tel.info("HANDLER_DATA");
    this.dispatch("debug", {
      data: {
        traceName: this.tel.namespace,
        direction: "rx",
        time: new Date().toISOString(),
        encoding: "utf8",
        text: buf.toString("utf8"),
        hex: buf.toString("hex"),
        length: buf.length,
      },
    });
    this.emit("receive", buf);
  }

  private handleError(error: Error): void {
    this.tel.info("HANDLER_ERROR");
    this.emit("error", { error: error.message, code: error.name });
  }

  private handleDrain(): void {
    this.tel.info("HANDLER_DRAIN");
  }

  private async scheduleRetry(): Promise<void> {
    if (this.retrying || this.stopped) return;
    this.retrying = true;
    this.tel.warn("RETRY_SCHEDULED");
    this.emit("retryScheduled", { delay: RETRY_DELAY });
    return new Promise((resolve) => {
      this.retryTimeout = setTimeout(async () => {
        this.retryTimeout = undefined;
        this.retrying = false;
        if (!this.stopped) {
          await this.start();
        }
        resolve();
      }, RETRY_DELAY);
    });
  }

  write(data: string | Uint8Array | Buffer): number {
    if (!this.socket) {
      this.tel.warn("SEND_ATTEMPTED_BEFORE_SOCKET_INITALIZATION");
      return -1;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.tel.info("SEND_DATA", {
      bufferHex: buffer.toString("hex"),
      bufferString: buffer.toString("utf8"),
    });
    this.dispatch("debug", {
      data: {
        traceName: this.tel.namespace,
        direction: "tx",
        time: new Date().toISOString(),
        encoding: "utf8",
        text: buffer.toString("utf8"),
        hex: buffer.toString("hex"),
        length: buffer.length,
      },
    });

    let bytesWritten = -1;
    this.socket.send(buffer, (error, n) => {
      if (error) {
        this.handleError(error);
        return;
      }
      bytesWritten = n;
      this.emit("transmit", { bytesWritten: buffer.length });
    });

    return bytesWritten;
  }

  async start() {
    this.stopped = false;
    this.retrying = false;
    const result = await this.tel.task("CONNECTION_START", async (span) => {
      this.tel.info("CONNECTION_PARAMS", this.config);
      span.setAttributes({ addr: this.config.addr, port: this.config.port });
      return await new Promise<dgram.Socket>((resolve, reject) => {
        const socket = dgram.createSocket("udp4");

        socket.on("error", (error) => {
          this.handleError(error);
          reject(error);
        });
        socket.on("message", (buf) => this.handleData(buf));
        socket.on("close", () => {
          this.handleClose();
        });
        socket.connect(this.config.port, this.config.addr, () => {
          this.handleDrain();
          resolve(socket);
        });
      });
    });

    if (result.ok) {
      this.socket = result.data;
      this.emit("connected", undefined);
    } else {
      this.tel.warn("CONNECTION_START_FAILED");
      await this.scheduleRetry();
    }
  }

  private async handleClose(): Promise<void> {
    this.tel.info("HANDLER_CLOSE", { stopped: this.stopped });
    this.socket = undefined;
    this.emit("disconnected", { error: undefined });
    if (!this.stopped) {
      await this.scheduleRetry();
    }
  }

  end(): void {
    this.stopped = true;
    this.retrying = false;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }

    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket = undefined;
    this.tel.info("CONNECTION_ENDED_MANUALLY");
    this.emit("disconnected", { error: undefined });
  }
}
