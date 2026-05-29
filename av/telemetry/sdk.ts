import { SeverityNumber, type Logger, type ReadableLogRecord } from "./types";
import { type LogRecordExporter, MultiLogExporter } from "./exporters";

class LoggerProvider {
  constructor(private exporter: LogRecordExporter | null) {}

  getLogger(_name: string): Logger {
    return {
      emit: (record: ReadableLogRecord) => {
        if (
          typeof process === "object" &&
          typeof process.env === "object" &&
          typeof process.env.NODE_ENV === "string" &&
          process.env.NODE_ENV === "testing" &&
          record.severityNumber &&
          record.severityNumber === SeverityNumber["ERROR"]
        ) {
          throw Error("Logger got an error.\n" + JSON.stringify(record));
        }
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

export function StartLogging(exporters: LogRecordExporter[]) {
  if (loggerProvider) {
    return;
  }
  loggerProvider = new LoggerProvider(new MultiLogExporter(exporters));
}
