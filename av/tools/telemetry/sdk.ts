import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { MultiLogExporter } from "./exporters";

let loggerProvider: LoggerProvider | null = null;

export function getLoggerProvider(): LoggerProvider {
  if (!loggerProvider) {
    throw new Error("LoggerProvider not initialized. Call StartLogging first.");
  }
  return loggerProvider;
}

export function StartLogging(exporters: MultiLogExporter) {
  loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor(exporters)],
  });

  new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: "http://localhost:4318/v1/traces" }),
    instrumentations: [new PinoInstrumentation()],
  }).start();
}
