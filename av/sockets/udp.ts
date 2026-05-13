import * as dgram from "node:dgram";

import { TypedEventTarget } from "../lib/eventtarget";
import type { SocketEventMap } from "@av/types";
import { Telemetry } from "@av/telemetry";
import { bufferHex } from "./hex";

type UdpConfig = {
  addr: string;
  port: number;
};

type UdpEvents = SocketEventMap & {
  retryScheduled: { delay: number };
};

const RETRY_DELAY = 5000;

export class Udp extends TypedEventTarget<UdpEvents> {
  private socket: dgram.Socket | undefined;
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private retrying = false;
  private stopped = true;
  private config: UdpConfig;
  private tel: Telemetry;

  constructor(args: UdpConfig) {
    super();
    this.config = args;
    this.tel = new Telemetry(`udp-client-${this.config.addr}:${this.config.port}`);
    this.tel.info("INITALIZE", this.config);
  }

  private emit<EventName extends keyof UdpEvents>(
    event: EventName,
    payload: UdpEvents[EventName],
  ): void {
    this.dispatch(event, payload);
  }

  private handleData(buf: Buffer): void {
    this.tel.info("HANDLER_DATA");
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

  send(data: string | Uint8Array | Buffer): boolean {
    if (!this.socket) {
      this.tel.warn("SEND_ATTEMPTED_BEFORE_SOCKET_INITALIZATION");
      return false;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.tel.info("SEND_DATA", { bufferHex: bufferHex(buffer), bufferString: buffer.toString() });

    this.socket.send(buffer, (error) => {
      if (error) {
        this.handleError(error);
        return;
      }

      this.emit("transmit", { bytesWritten: buffer.length });
    });

    return true;
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
          void this.handleClose();
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
