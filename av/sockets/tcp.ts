import * as net from "node:net";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { SocketEventMap } from "@av/types";
import { Telemetry } from "@av/telemetry";
import { bufferHex } from "@av/sockets/hex";

type TcpConfig = {
  addr: string;
  port: number;
};

type TcpEvents = SocketEventMap & {
  retryScheduled: { delay: number };
  timeout: void;
};

const RETRY_DELAY = 5000;

export class Tcp extends TypedEventTarget<TcpEvents> {
  private socket: net.Socket | undefined;
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private retrying = false;
  private stopped = true;
  private config: TcpConfig;
  private tel: Telemetry;
  name: string;

  constructor(args: TcpConfig) {
    const name = `tcp-client-${args.addr}:${args.port}`;
    const tel = new Telemetry(name);
    super(tel);
    this.config = args;
    this.name = name;
    this.tel = tel;
    this.tel.info("INITALIZE", this.config);
  }

  private emit<EventName extends keyof TcpEvents>(
    event: EventName,
    payload: TcpEvents[EventName],
  ): void {
    this.dispatch(event, payload);
  }

  private async handleOpen(): Promise<void> {
    this.tel.info("HANDLER_OPEN");
    this.retrying = false;
    if (this.retryTimeout) {
      this.tel.info("HANDLER_OPEN_RESET_TIMEOUT");
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    this.emit("connected", undefined);
  }

  private async handleClose(error?: Error): Promise<void> {
    this.tel.info("HANDLER_CLOSE", { stopped: this.stopped });
    this.socket = undefined;
    this.emit("disconnected", { error: error?.message });
    if (!this.stopped) {
      await this.scheduleRetry();
    }
  }

  private handleError(error: Error): void {
    this.tel.info("HANDLER_ERROR");
    this.emit("error", { error: error.message, code: error.name });
  }

  private async handleConnectError(error: Error): Promise<void> {
    this.tel.info("HANDLER_CONNECT_ERROR");
    this.emit("error", { error: error.message, code: error.name });
    await this.scheduleRetry();
  }

  private handleData(data: Buffer): void {
    this.tel.info("RECEIVED_DATA", { length: data.length });
    this.emit("receive", data);
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

  async write(data: string | Uint8Array | Buffer): Promise<number> {
    if (!this.socket) {
      this.tel.warn("WRITE_ATTEMPTED_BEFORE_SOCKET_INITALIZATION");
      return -1;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.tel.info("WRITE_DATA", { bufferHex: bufferHex(buffer), bufferString: buffer.toString() });

    const flushed = this.socket.write(buffer);

    if (flushed) {
      this.emit("transmit", { bytesWritten: buffer.length });
    }

    return buffer.length;
  }

  async start() {
    this.stopped = false;
    this.retrying = false;
    const result = await this.tel.task("CONNECTION_START", async (span) => {
      this.tel.info("CONNECTION_PARAMS", this.config);
      span.setAttributes({ addr: this.config.addr, port: this.config.port });
      return net.createConnection({ host: this.config.addr, port: this.config.port }, () => {
        this.tel.info("HANDLER_OPEN_SLEEP_1_SECOND");
        setTimeout(() => {
          void this.handleOpen();
        }, 1000);
      });
    });

    if (!result.ok) {
      await this.scheduleRetry();
      return;
    }
    this.socket = result.data;

    this.socket.setTimeout(10000, async () => {
      this.emit("timeout", undefined);
      await this.scheduleRetry();
    });

    this.socket.on("data", (data) => {
      this.handleData(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    this.socket.on("drain", () => this.handleDrain());
    this.socket.on("end", () => {
      this.tel.info("SOCKET_END");
    });
    this.socket.on("error", async (err) => {
      this.handleError(err);
      await this.handleConnectError(err);
    });
    this.socket.on("close", (hadError) => {
      void this.handleClose(hadError ? new Error("socket closed with error") : undefined);
    });
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

    this.socket.end();
    this.socket = undefined;
    this.tel.info("CONNECTION_ENDED_MANUALLY");
    this.emit("disconnected", { error: undefined });
  }
}
