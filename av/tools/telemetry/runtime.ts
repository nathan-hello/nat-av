import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { Span, SpanContext, SpanStatusCode } from "./types";

const spanStorage = new AsyncLocalStorage<Span>();

function createId(bytes: number): string {
  return randomUUID().replaceAll("-", "").slice(0, bytes * 2);
}

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
  return spanStorage.getStore();
}

export function createSpan(name: string, parent?: SpanContext): Span {
  return new RuntimeSpan(name, parent);
}

export function withSpan<T>(span: Span, fn: () => T): T {
  return spanStorage.run(span, fn);
}
