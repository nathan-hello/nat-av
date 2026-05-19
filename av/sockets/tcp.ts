import * as net from "node:net";
import { TypedEventTarget } from "@av/lib/eventtarget";
import type { SocketEventMap } from "@av/types";
import { Telemetry } from "@av/telemetry";
import { bufferHex } from "@av/sockets/hex";

type TcpConfig = {
  addr: string;
  port: number;
  keepAlive: boolean;
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
    const name = `TcpClient::${args.addr}:${args.port}`;
    const tel = new Telemetry(name);
    super(tel);
    this.config = args;
    this.name = name;
    this.tel = tel;
    this.tel.info("INITALIZE", this.config);
  }

  private async scheduleRetry(): Promise<void> {
    if (this.retrying || this.stopped || !this.config.keepAlive) {
      return;
    }
    this.retrying = true;
    this.tel.warn("RETRY_SCHEDULED");
    this.dispatch("retryScheduled", { delay: RETRY_DELAY });
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
    this.tel.info("WRITE_DATA", {
      // bufferHex: bufferHex(buffer),
      bufferString: buffer.toString(),
    });

    const flushed = this.socket.write(buffer);

    if (flushed) {
      this.dispatch("transmit", { bytesWritten: buffer.length });
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
          this.tel.info("HANDLER_OPEN");
          this.retrying = false;
          if (this.retryTimeout) {
            this.tel.info("HANDLER_OPEN_RESET_TIMEOUT");
            clearTimeout(this.retryTimeout);
            this.retryTimeout = undefined;
          }

          this.dispatch("connected", undefined);
        }, 1000);
      });
    });

    if (!result.ok) {
      await this.scheduleRetry();
      return;
    }
    this.socket = result.data;

    this.socket.on("data", (data) => {
      this.tel.info("RECEIVED_DATA", { length: data.length });
      this.tel.debug("RECIEVED_DATA_TEXT", { text: data.toString("utf8") });
      this.dispatch("receive", Buffer.isBuffer(data) ? data : Buffer.from(data));
    });

    this.socket.on("drain", () => {
      this.tel.info("HANDLER_DRAIN");
    });

    this.socket.on("end", () => {
      this.tel.info("SOCKET_END");
    });

    this.socket.on("error", async (error) => {
      this.tel.info("HANDLER_ERROR");
      this.dispatch("error", { error: error.message, code: error.name });
    });

    this.socket.on("close", async (hadError) => {
      this.tel.info("HANDLER_CLOSE", { stopped: this.stopped });
      this.socket = undefined;
      this.dispatch("disconnected", {
        error: hadError ? "socket closed with error" : "socket closed with no error",
      });
      await this.scheduleRetry();
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
    this.dispatch("disconnected", { error: undefined });
  }
}
