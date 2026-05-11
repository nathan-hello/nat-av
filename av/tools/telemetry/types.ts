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

export type ReadableLogRecord = {
  hrTime: [number, number];
  body: BodyValue;
  attributes: Record<string, AttributeValue>;
  severityNumber?: SeverityNumber;
  severityText?: string;
  spanContext?: SpanContext;
  instrumentationScope: { name: string };
};

export type Logger = {
  emit(record: ReadableLogRecord): void;
};

export interface Span {
  readonly context: SpanContext;
  setAttributes(attributes: Record<string, AttributeValue>): void;
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
  end(): void;
}
