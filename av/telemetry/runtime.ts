import type { Span, SpanContext, SpanStatusCode } from "./types";

function createId(bytes: number): string {
  const crypto = globalThis.crypto;
  if (crypto.randomUUID) {
    return crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, bytes * 2);
  }

  const buffer = new Uint8Array(bytes);
  if (crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < bytes; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

let activeSpan: Span | undefined;

class RuntimeSpan implements Span {
  readonly context: SpanContext;
  private ended = false;
  private attributes: Record<string, unknown> = {};
  private status: { code: SpanStatusCode; message?: string } | undefined;

  constructor(_name: string, parent: SpanContext | undefined) {
    this.context = {
      traceId: parent?.traceId ?? createId(16),
      spanId: createId(8),
      parentSpanId: parent?.spanId,
    };
  }

  setAttributes(attributes: Record<string, unknown>): void {
    this.attributes = { ...this.attributes, ...attributes };
  }

  setStatus(status: { code: SpanStatusCode; message?: string }): void {
    this.status = status;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    void this.attributes;
    void this.status;
  }
}

export function getActiveSpan(): Span | undefined {
  return activeSpan;
}

export function createSpan(name: string, parent?: SpanContext): Span {
  return new RuntimeSpan(name, parent);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

export function withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T>;
export function withSpan<T>(span: Span, fn: () => T): T;
export function withSpan<T>(
  span: Span,
  fn: () => T | Promise<T>,
): T | Promise<Awaited<T>> {
  const previousSpan = activeSpan;
  activeSpan = span;

  try {
    const result = fn();
    if (isPromiseLike(result)) {
      return Promise.resolve(result).finally(() => {
        activeSpan = previousSpan;
      });
    }

    activeSpan = previousSpan;
    return result;
  } catch (error) {
    activeSpan = previousSpan;
    throw error;
  }
}
