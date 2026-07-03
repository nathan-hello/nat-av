import { Convert } from "@av/lib/convert";
import { TypedEventTarget } from "@av/lib/eventtarget";
import { Telemetry } from "@av/telemetry";
import type { Events, Sockets } from "@av/types";
import * as net from "node:net";

const RETRY_DELAY = 5000;
const CONNECT_TIMEOUT = 5000;

export class Tcp
  extends TypedEventTarget<Events.Socket.TcpMap>
  implements Sockets.Client
{
  private socket: net.Socket | undefined;
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private retrying = false;
  private stopped = true;
  private config: Sockets.Args.Tcp;
  private tel: Telemetry;
  name: string;

  constructor(args: Sockets.Args.Tcp) {
    const name = `TcpClient::${args.addr}:${args.port}`;
    const tel = new Telemetry(name);
    super(tel);
    this.config = args;
    this.name = name;
    this.tel = tel;
    this.tel.info("INITALIZE", this.config);
  }

  private async scheduleRetry(): Promise<void> {
    if (this.retrying || this.stopped || this.config.keepAliveMs === undefined) {
      return;
    }
    this.retrying = true;
    const delay = this.config.retryDelayMs ?? RETRY_DELAY;
    this.tel.warn("RETRY_SCHEDULED");
    this.dispatch("retryScheduled", { delay });
    return new Promise((resolve) => {
      this.retryTimeout = setTimeout(async () => {
        this.retryTimeout = undefined;
        this.retrying = false;
        if (!this.stopped) {
          await this.start();
        }
        resolve();
      }, delay);
    });
  }

  async write(data: string | Uint8Array | Buffer): Promise<number> {
    if (!this.socket) {
      this.tel.warn("WRITE_ATTEMPTED_BEFORE_SOCKET_INITALIZATION");
      return -1;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.dispatch("debug", {
      data: {
        traceName: this.tel.namespace,
        direction: "tx",
        time: Date.now(),
        encoding: this.config.encoding ?? "unknown",
        data: Convert.toUint8Array(buffer),
      },
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

      return new Promise<net.Socket>((resolve, reject) => {
        const socket = net.createConnection({
          host: this.config.addr,
          port: this.config.port,
        });

        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("error", onError);
          clearTimeout(timer);
        };

        const onConnect = () => {
          cleanup();
          resolve(socket);
        };

        const onError = (error: Error) => {
          cleanup();
          socket.destroy();
          reject(error);
        };

        const timer = setTimeout(() => {
          cleanup();
          socket.destroy();
          reject(new Error(`connect timeout after ${CONNECT_TIMEOUT}ms`));
        }, CONNECT_TIMEOUT);

        socket.once("connect", onConnect);
        socket.once("error", onError);
      });
    });

    if (!result.ok) {
      this.tel.warn("CONNECTION_START_FAILED", {
        message: result.error.message,
        code: result.error.name,
      });
      await this.scheduleRetry();
      return;
    }

    this.socket = result.data;

    if (this.config.keepAliveMs !== undefined) {
      this.socket.setKeepAlive(true, this.config.keepAliveMs);
      this.tel.info("KEEPALIVE_ENABLED", {
        initialDelay: this.config.keepAliveMs,
      });
    }

    this.socket.on("data", (data) => {
      this.tel.info("RECIEVED_DATA", {
        hex: data.toString("hex"),
        text: data.toString("utf8"),
        length: data.length,
      });

      this.dispatch("debug", {
        data: {
          traceName: this.tel.namespace,
          direction: "rx",
          time: Date.now(),
          encoding: "utf8",
          data: Convert.toUint8Array(data),
        },
      });

      this.dispatch(
        "receive",
        Buffer.isBuffer(data) ? data : Buffer.from(data),
      );
    });

    this.socket.on("drain", () => {
      this.tel.info("HANDLER_DRAIN");
    });

    this.socket.on("end", () => {
      this.tel.info("SOCKET_END");
    });

    this.socket.on("error", (error) => {
      this.tel.info("HANDLER_ERROR", {
        message: error.message,
        code: error.name,
      });
      this.dispatch("error", { error: error.message, code: error.name });
    });

    this.socket.on("close", (hadError) => {
      this.tel.info("HANDLER_CLOSE", { stopped: this.stopped });
      this.socket = undefined;
      this.dispatch("disconnected", {
        error:
          hadError ? "socket closed with error" : "socket closed with no error",
      });
      void this.scheduleRetry();
    });

    this.tel.info("HANDLER_OPEN");
    this.dispatch("connected", undefined);
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
