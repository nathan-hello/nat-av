import * as RuntimeMod from "./runtime";
import { getLoggerProvider } from "./sdk";
import {
  SeverityNumber,
  SpanStatusCode,
  type AttributeValue,
  type Span,
} from "./types";

export type TelemetryLogSchema = {
  info: [string, Record<string, AttributeValue>];
  debug: [string, Record<string, AttributeValue>];
  warn: [string, Record<string, AttributeValue>];
  error: [string, Record<string, AttributeValue>];
};

export type TaskResult<R> = { ok: true; data: R } | { ok: false; error: Error };

export class Telemetry<T extends TelemetryLogSchema = TelemetryLogSchema> {
  namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  task<R>(name: string, fn: (span: Span) => Promise<R>): Promise<TaskResult<R>>;
  task<R>(name: string, fn: (span: Span) => R): TaskResult<R>;
  task<R>(
    name: string,
    fn: (span: Span) => R | Promise<R>,
  ): TaskResult<R> | Promise<TaskResult<R>> {
    const span = RuntimeMod.createSpan(
      name,
      RuntimeMod.getActiveSpan()?.context,
    );

    return RuntimeMod.withSpan(span, () => {
      try {
        const result = fn(span);

        if (result instanceof Promise) {
          return result
            .then((data): TaskResult<R> => {
              span.setStatus({ code: SpanStatusCode.OK });
              return { ok: true as const, data };
            })
            .catch((err): TaskResult<R> => {
              const error = this.handleError(span, name, err);
              if (err instanceof Error) {
                return {
                  ok: false as const,
                  error: err,
                };
              }
              return { ok: false as const, error: new Error(error) };
            })
            .finally(() => span.end());
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return { ok: true as const, data: result };
      } catch (err) {
        const error = this.handleError(span, name, err);
        span.end();
        if (err instanceof Error) {
          return { ok: false as const, error: err };
        }
        return { ok: false as const, error: new Error(error) };
      }
    });
  }

  private handleError(span: Span, name: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    this.emit(`Task Error: ${name}`, SeverityNumber.ERROR, "ERROR", {
      error: message,
    });
    return message;
  }

  debug(
    body: T["debug"][0],
    attributes?: T["debug"][1] | (() => T["debug"][1]),
  ) {
    const attr = typeof attributes === "function" ? attributes() : attributes;
    this.emit(body, SeverityNumber.DEBUG, "DEBUG", attr);
  }

  warn(body: T["warn"][0], attributes?: T["warn"][1] | (() => T["warn"][1])) {
    const attr = typeof attributes === "function" ? attributes() : attributes;
    this.emit(body, SeverityNumber.WARN, "WARN", attr);
  }

  info(body: T["info"][0], attributes?: T["info"][1] | (() => T["info"][1])) {
    const attr = typeof attributes === "function" ? attributes() : attributes;
    this.emit(body, SeverityNumber.INFO, "INFO", attr);
  }

  error(
    body: T["error"][0],
    attributes?: T["error"][1] | (() => T["error"][1]),
  ) {
    const attr = typeof attributes === "function" ? attributes() : attributes;
    this.emit(body, SeverityNumber.ERROR, "ERROR", attr);
  }

  private emit(
    body: string,
    severityNumber: SeverityNumber,
    severityText: string,
    attributes?: any,
  ) {
    const logger = getLoggerProvider().getLogger(this.namespace);
    logger.emit({
      hrTime: [Math.floor(Date.now() / 1000), 0],
      body,
      severityNumber,
      severityText,
      attributes: attributes ?? {},
      spanContext: RuntimeMod.getActiveSpan()?.context,
      instrumentationScope: { name: this.namespace },
    });
  }
}
