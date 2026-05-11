import * as net from "node:net";

import { TypedEventTarget } from "../lib/eventtarget";
import type { SocketEventMap } from "@av/types";
import { Telemetry } from "../tools/telemetry";
import { bufferHex } from "./hex";

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
    super();
    this.config = args;
    this.name = `tcp-client-${this.config.addr}:${this.config.port}`;
    this.tel = new Telemetry(this.name);
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
    this.tel.info("HANDLER_OPEN_SLEEP_1_SECOND");
    await new Promise((resolve) => setTimeout(resolve, 1000));
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
    this.tel.info("HANDLER_DATA");
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
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.createConnection(
          { host: this.config.addr, port: this.config.port },
          () => {
            void this.handleOpen();
            resolve(socket);
          },
        );

        socket.setTimeout(10000, async () => {
          this.emit("timeout", undefined);
          await this.scheduleRetry();
        });

        socket.on("data", (data) => this.handleData(Buffer.isBuffer(data) ? data : Buffer.from(data)));
        socket.on("drain", () => this.handleDrain());
        socket.on("end", () => {
          this.tel.info("SOCKET_END");
        });
        socket.on("error", (err) => {
          this.handleError(err);
          void this.handleConnectError(err);
          reject(err);
        });
        socket.on("close", (hadError) => {
          void this.handleClose(hadError ? new Error("socket closed with error") : undefined);
        });
      });
    });

    if (result.ok) {
      this.socket = result.data;
    } else {
      this.tel.warn("CONNECTION_START_FAILED");
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

    this.socket.end();
    this.socket = undefined;
    this.tel.info("CONNECTION_ENDED_MANUALLY");
    this.emit("disconnected", { error: undefined });
  }
}
