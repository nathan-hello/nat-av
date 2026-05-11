import { Client } from "ssh2";
import type { ClientChannel } from "ssh2";
import { TypedEventTarget } from "../lib/eventtarget";
import type { SocketEventMap } from "@av/types";
import { Telemetry } from "../tools/telemetry";
import { bufferHex } from "./hex";

type SshConfig = {
  addr: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string | Buffer;
};

type SshEvents = SocketEventMap & {
  retryScheduled: { delay: number };
};

const RETRY_DELAY = 5000;


export class Ssh extends TypedEventTarget<SshEvents> {
  private client: Client | undefined;
  private channel: ClientChannel | undefined;
  private writeQueue: Buffer[] = [];
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private retrying = false;
  private stopped = true;
  private config: SshConfig;
  private tel: Telemetry;

  constructor(args: SshConfig) {
    super();
    this.config = args;
    this.tel = new Telemetry(`ssh-client-${this.config.addr}:${this.config.port}`);
    this.tel.info("INITALIZE", { addr: args.addr, port: args.port, username: args.username });
  }

  private emit<EventName extends keyof SshEvents>(
    event: EventName,
    payload: SshEvents[EventName],
  ): void {
    this.dispatch(event, payload);
  }

  private handleChannelData(data: Buffer): void {
    this.tel.info("HANDLER_DATA");
    this.emit("receive", data);
  }

  private handleChannelClose(): void {
    this.tel.info("HANDLER_CHANNEL_CLOSE");
    this.channel = undefined;
  }

  private async handleClientClose(): Promise<void> {
    this.tel.info("HANDLER_CLIENT_CLOSE", { stopped: this.stopped });
    this.channel = undefined;
    this.client = undefined;
    this.emit("disconnected", { error: undefined });
    if (!this.stopped) {
      await this.scheduleRetry();
    }
  }

  private handleClientError(err: Error): void {
    this.tel.info("HANDLER_ERROR");
    this.emit("error", { error: err.message, code: err.name });
  }

  private handleDrain(): void {
    this.tel.info("HANDLER_DRAIN", { writeQueue: this.writeQueue.length });
    while (this.writeQueue.length > 0) {
      this.tel.info("HANDLER_DRAIN_WRITEQUEUE_NONZERO");
      const buffer = this.writeQueue[0];
      if (!this.channel) return;

      const flushed = this.channel.write(buffer);
      this.emit("transmit", { bytesWritten: buffer.length });
      this.writeQueue.shift();

      if (!flushed) {
        break;
      }
    }
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
    if (!this.channel) {
      this.tel.warn("WRITE_ATTEMPTED_BEFORE_CHANNEL_INITALIZATION");
      return -1;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.tel.info("WRITE_DATA", { bufferHex: bufferHex(buffer), bufferString: buffer.toString() });

    const flushed = this.channel.write(buffer);
    this.emit("transmit", { bytesWritten: buffer.length });

    if (!flushed) {
      this.tel.info("WRITE_BACKPRESSURE", { bufferLength: buffer.length });
      this.writeQueue.push(buffer);
    }

    return buffer.length;
  }

  async start() {
    this.stopped = false;
    this.retrying = false;

    const client = new Client();
    this.client = client;

    this.tel.info("CONNECTION_START", { addr: this.config.addr, port: this.config.port });

    client.on("error", (err) => this.handleClientError(err));
    client.on("close", () => this.handleClientClose());

    client.on("ready", () => {
      this.tel.info("CLIENT_READY");
      client.shell(false, (err, stream) => {
        if (err) {
          this.tel.warn("SHELL_OPEN_FAILED", { error: err.message });
          this.emit("error", { error: err.message, code: err.name });
          client.end();
          return;
        }

        this.channel = stream;

        stream.on("data", (data: Buffer) => this.handleChannelData(data));
        stream.on("close", () => this.handleChannelClose());
        stream.on("drain", () => this.handleDrain());

        this.emit("connected", undefined);
      });
    });

    client.connect({
      host: this.config.addr,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      privateKey: this.config.privateKey,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      readyTimeout: 10000,
    });
  }

  end(): void {
    this.stopped = true;
    this.retrying = false;
    this.writeQueue = [];
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = undefined;
    }

    if (this.client) {
      this.client.end();
      this.client = undefined;
      this.tel.info("CONNECTION_ENDED_MANUALLY");
      this.emit("disconnected", { error: undefined });
    }
  }
}
