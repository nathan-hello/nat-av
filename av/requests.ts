import { TypedEventTarget } from "@av/lib/eventtarget";
import type { DataDelimiter, DataFormatter } from "@av/sockets/delimiters";
import { Telemetry, type TaskResult } from "@av/telemetry";
import type { PendingRequest, RequestEvents, RequestSocket, ResponseStrategy } from "@av/types";

export class RequestManager<Request, Message> extends TypedEventTarget<
  RequestEvents<Request, Message>
> {
  private readonly tel: Telemetry;
  private readonly socket: RequestSocket;
  private readonly delimiter: DataDelimiter<Message>;
  private readonly formatter?: DataFormatter<Request>;
  private readonly timeoutMs: number;
  private readonly responseStrategy?: ResponseStrategy<Request, Message>;
  private readonly pending: PendingRequest<Request, Message>[] = [];
  private readonly offReceive: () => void;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private nextSendAt = 0;
  private ended = false;

  constructor({
    tel,
    socket,
    formatter,
    delimiter,
    timeoutMs = 10000,
    responseStrategy,
  }: {
    tel: Telemetry;
    socket: RequestSocket;
    delimiter: DataDelimiter<Message>;
    formatter?: DataFormatter<Request>;
    timeoutMs?: number;
    responseStrategy?: ResponseStrategy<Request, Message>;
  }) {
    super();
    this.tel = tel;
    this.socket = socket;
    this.formatter = formatter;
    this.delimiter = delimiter;
    this.timeoutMs = timeoutMs;
    this.responseStrategy = responseStrategy;

    this.offReceive = this.socket.on("receive", (chunk) => {
      const messages = this.tel.task("DELIMITER", () => {
        return this.delimiter(chunk);
      });

      if (!messages.ok) {
        this.dispatch("error", { phase: "receive", error: messages.error });
        return;
      }

      if (!messages.data) {
        return;
      }

      for (const message of messages.data) {
        if (this.resolvePending(message)) {
          continue;
        }

        this.dispatch("message", message);
      }
    });
  }

  request<Response extends Message = Message>(
    request: Request,
  ): Promise<TaskResult<Response>> {
    if (this.ended) {
      return Promise.resolve({ ok: false, error: "requests-ended" });
    }

    return new Promise<TaskResult<Response>>((resolve) => {
      const entry: PendingRequest<Request, Message> = {
        request,
        // TSAS:
        resolve: resolve as (result: TaskResult<Message>) => void,
        sent: false,
      };

      entry.timeout = setTimeout(() => {
        this.removePending(entry);
        resolve({ ok: false, error: "request-timeout" });
        this.dispatch("timeout", { request });
        this.flush();
      }, this.timeoutMs);

      this.pending.push(entry);

      const enqueue = this.tel.task("REQUESTS_ENQUEUE", () => {
        this.flush();
      });

      if (!enqueue.ok) {
        if (entry.timeout !== undefined) {
          clearTimeout(entry.timeout);
        }
        this.removePending(entry);
        resolve({ ok: false, error: enqueue.error });
        this.dispatch("error", {
          phase: "send",
          error: enqueue.error,
          request,
        });
      }
    });
  }

  send(request: Request): Promise<TaskResult<number>> {
    if (this.ended) {
      return Promise.resolve({ ok: false, error: "requests-ended" });
    }

    return Promise.resolve(
      this.tel.task("REQUESTS_SEND_UNTRACKED", async () => {
        if (this.formatter) {
          return this.socket.write(this.formatter(request));
        }
        // TODO: there should be other ways to turn request into a string/buffer without a formatFn
        return this.socket.write(String(request));
      }),
    );
  }

  override end(reason = "requests-ended") {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.offReceive();
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    for (const entry of this.pending.splice(0)) {
      if (entry.timeout !== undefined) {
        clearTimeout(entry.timeout);
      }
      entry.resolve({ ok: false, error: reason });
    }

    super.end();
  }

  private flush() {
    if (this.ended) {
      return;
    }

    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const maxInFlight = this.getMaxInFlight();
    const minGapMs = this.getMinGapMs();

    while (true) {
      const next = this.pending.find((entry) => !entry.sent);
      if (!next) {
        return;
      }

      if (this.getInFlightCount() >= maxInFlight) {
        return;
      }

      const waitMs = this.nextSendAt - Date.now();
      if (waitMs > 0) {
        this.scheduleFlush(waitMs);
        return;
      }

      this.sendPending(next);
      this.nextSendAt = Date.now() + minGapMs;

      if (minGapMs > 0) {
        this.scheduleFlush(minGapMs);
        return;
      }
    }
  }

  private async sendPending(entry: PendingRequest<Request, Message>) {
    entry.sent = true;

    const result = await this.tel.task("REQUESTS_SEND", async () => {
      if (this.formatter) {
        return this.socket.write(this.formatter(entry.request));
      }
      // TODO: there should be other ways to turn request into a string/buffer without a formatFn
      return this.socket.write(String(entry.request));
    });
    if (result.ok) {
      return;
    }

    if (entry.timeout !== undefined) {
      clearTimeout(entry.timeout);
    }

    this.removePending(entry);
    entry.resolve(result);
    this.dispatch("write-error", {
      request: entry.request,
      error: result.error,
    });
    this.flush();
  }

  private resolvePending(message: Message) {
    const match = this.tel.task("REQUESTS_MATCH", () => {
      const strategy = this.responseStrategy;
      switch (strategy?.strategy) {
        case "match":
          return this.pending.findIndex((entry) =>
            strategy.matchFn(entry.request, message),
          );
        case "blocking-queue":
          return this.pending.findIndex((entry) => entry.sent);
        default:
          return this.pending.findIndex((entry) => entry.sent);
      }
    });

    if (!match.ok) {
      this.dispatch("error", { phase: "match", error: match.error, message });
      return false;
    }

    if (match.data === -1) {
      return false;
    }

    const [entry] = this.pending.splice(match.data, 1);
    if (entry.timeout !== undefined) {
      clearTimeout(entry.timeout);
    }
    entry.resolve({ ok: true, data: message });
    this.flush();
    return true;
  }

  private removePending(entry: PendingRequest<Request, Message>) {
    const index = this.pending.indexOf(entry);
    if (index !== -1) {
      this.pending.splice(index, 1);
    }
  }

  private scheduleFlush(delayMs: number) {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, delayMs);
  }

  private getInFlightCount() {
    return this.pending.filter((entry) => entry.sent).length;
  }

  private getMaxInFlight() {
    const strategy = this.responseStrategy;
    switch (strategy?.strategy) {
      case "match":
        return strategy.maxInFlight ?? Number.POSITIVE_INFINITY;
      case "blocking-queue":
      default:
        return 1;
    }
  }

  private getMinGapMs() {
    return this.responseStrategy?.minGapMs ?? 0;
  }
}
