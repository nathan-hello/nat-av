// NOTE(nate): These two are aliased differently so if in the future we want
// to restrict one or the other it's obvious what we are affecting. OTEL by
// default does not allow one-level-deep JSON object in an Attributes value
// field, whereas body can be nested deeply.
export type AttributeValue = any;
export type BodyValue = any;

export const SeverityNumber = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
} as const;

export function SeverityToString(severity?: number): string {
  if (!severity) return "info";
  if (severity <= 8) return "debug";
  if (severity <= 12) return "info";
  if (severity <= 16) return "warn";
  return "error";
}

export type SeverityNumber =
  (typeof SeverityNumber)[keyof typeof SeverityNumber];

export const SpanStatusCode = {
  OK: 1,
  ERROR: 2,
} as const;

export type SpanStatusCode =
  (typeof SpanStatusCode)[keyof typeof SpanStatusCode];

export type SpanContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
};

export type LogEntry = {
  time: string;
  context: {
    spanId: string | undefined;
    traceId: string | undefined;
    traceName: string;
  };
  severity: {
    id: number;
    text: string;
  };
  name: string;
  data: BodyValue;
};

export type ReadableLogRecord = {
  hrTime: [number, number];
  body: BodyValue;
  attributes: Record<string, AttributeValue>;
  severityNumber?: SeverityNumber;
  severityText?: string;
  spanContext?: SpanContext;
  instrumentationScope: { name: string };
};

export function ReadableLogRecordStringify(record: ReadableLogRecord): string {
  return JSON.stringify({
    level: SeverityToString(record.severityNumber),
    ...record.attributes,
    ...(record.spanContext && {
      trace_id: record.spanContext.traceId,
      span_id: record.spanContext.spanId,
    }),
    message:
      typeof record.body === "string" ?
        record.body
      : JSON.stringify(record.body),
    attributes: record.attributes,
  });
}

export function ReadableLogRecordToLogEntry(
  record: ReadableLogRecord,
): LogEntry {
  let body: string;
  if (typeof record.body === "string") {
    body = record.body;
  } else {
    try {
      body = JSON.stringify(record.body);
    } catch {
      body = "OTEL_ENTRY_BODY_WAS_NOT_STRING_AND_JSON_STRINGIFY_FAILED";
    }
  }
  return {
    time:
      record.hrTime ?
        new Date(Number(record.hrTime[0]) * 1000).toISOString()
      : new Date().toISOString().slice(11, 23),
    context: {
      spanId: record.spanContext?.spanId,
      traceId: record.spanContext?.traceId,
      traceName: record.instrumentationScope.name,
    },
    severity: {
      id: record.severityNumber?.valueOf() ?? -1,
      text: record.severityText ?? "unknown-severity",
    },
    name: body,
    data: record.attributes,
  };
}

export type Logger = {
  emit(record: ReadableLogRecord): void;
};

export interface Span {
  readonly context: SpanContext;
  setAttributes(attributes: Record<string, AttributeValue>): void;
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
  end(): void;
}
