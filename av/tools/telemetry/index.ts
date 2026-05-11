import { trace, SpanStatusCode, type Span, context } from "@opentelemetry/api";
import { SeverityNumber, type AnyValue } from "@opentelemetry/api-logs";
import { getLoggerProvider } from "./sdk";
import { RPCErrorData } from "../../rpc/types";

export type TelemetryLogSchema = {
  info: [string, Record<string, AnyValue>];
  debug: [string, Record<string, AnyValue>];
  warn: [string, Record<string, AnyValue>];
  error: [string, Record<string, AnyValue>];
};

// Define a standardized Result type
export type TaskResult<R> =
  | { ok: true; data: R }
  | { ok: false; error: string; data?: RPCErrorData };

export class Telemetry<T extends TelemetryLogSchema = TelemetryLogSchema> {
  private tracer;
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
    this.tracer = trace.getTracer(namespace);
  }

  // Always get fresh logger from our provider
  private get logger() {
    return getLoggerProvider().getLogger(this.namespace);
  }

  // Overloads remain the same, but return TaskResult
  task<R>(name: string, fn: (span: Span) => Promise<R>): Promise<TaskResult<R>>;
  task<R>(name: string, fn: (span: Span) => R): TaskResult<R>;

  task<R>(
    name: string,
    fn: (span: Span) => R | Promise<R>,
  ): TaskResult<R> | Promise<TaskResult<R>> {
    return this.tracer.startActiveSpan(name, (span) => {
      try {
        const result = fn(span);

        if (result instanceof Promise) {
          return result
            .then((data): TaskResult<R> => {
              // sync success
              span.setStatus({ code: SpanStatusCode.OK });
              return { ok: true as const, data };
            })
            .catch((err): TaskResult<R> => {
              // async failure
              const error = this.handleError(span, name, err);
              if (err instanceof RPCErrorData) {
                return { ok: false as const, error: err.error.message, data: err };
              }
              if (err instanceof Error) {
                return { ok: false as const, error: err.message };
              }
              return { ok: false as const, error };
            })
            .finally(() => span.end());
        }

        // Sync Success
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return { ok: true as const, data: result };
      } catch (err) {
        // Sync Failure
        const error = this.handleError(span, name, err);
        span.end();
        if (err instanceof RPCErrorData) {
          return { ok: false as const, error: err.error.message, data: err };
        }
        if (err instanceof Error) {
          return { ok: false as const, error: err.message };
        }
        return { ok: false as const, error };
      }
    });
  }

  private handleError(span: Span, name: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    this.emit(`Task Error: ${name}`, SeverityNumber.ERROR, "ERROR", { error: message });
    return message;
  }

  debug(body: T["debug"][0], attributes?: T["debug"][1] | (() => T["debug"][1])) {
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

  error(body: T["error"][0], attributes?: T["error"][1] | (() => T["error"][1])) {
    const attr = typeof attributes === "function" ? attributes() : attributes;
    this.emit(body, SeverityNumber.ERROR, "ERROR", attr);
  }

  private emit(
    body: string,
    severityNumber: SeverityNumber,
    severityText: string,
    attributes?: any,
  ) {
    this.logger.emit({
      body,
      severityNumber,
      severityText,
      attributes,
      context: context.active(),
    });
  }
}
