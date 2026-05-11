import type { Logger, ReadableLogRecord } from "./types";
import type { LogRecordExporter, MultiLogExporter } from "./exporters";

class LoggerProvider {
  constructor(private exporter: LogRecordExporter | null) {}

  getLogger(_name: string): Logger {
    return {
      emit: (record: ReadableLogRecord) => {
        this.exporter?.export([record], () => {});
      },
    };
  }
}

let loggerProvider: LoggerProvider | null = null;

export function getLoggerProvider(): LoggerProvider {
  if (!loggerProvider) {
    throw new Error("LoggerProvider not initialized. Call StartLogging first.");
  }
  return loggerProvider;
}

export function StartLogging(exporters: MultiLogExporter) {
  loggerProvider = new LoggerProvider(exporters);
}
