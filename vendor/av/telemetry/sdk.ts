import { SimpleConsoleExporter, type LogRecordExporter } from "./exporters";
import { SeverityNumber, type Logger, type ReadableLogRecord } from "./types";

class LoggerProvider {
  public exporters: LogRecordExporter[] = [];

  constructor(exporter: LogRecordExporter | LogRecordExporter[] | null) {
    if (exporter === null) {
      return;
    }
    if (Array.isArray(exporter)) {
      exporter.forEach((e) => this.exporters.push(e));
      return;
    }
    this.exporters.push(exporter);
  }

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
          console.error(JSON.stringify(record));
          return;
        }
        this.exporters.forEach((e) => {
          e.export([record]);
        });
      },
    };
  }
}

let loggerProvider: LoggerProvider | null = null;

export function getLoggerProvider(): LoggerProvider {
  if (
    !loggerProvider &&
    typeof process === "object" &&
    typeof process.env === "object" &&
    typeof process.env.NODE_ENV === "string" &&
    process.env.NODE_ENV === "testing"
  ) {
    // AddExporters([new SimpleConsoleExporter("WARN")]);
    return new LoggerProvider([]);
  }
  if (!loggerProvider) {
    AddExporters([new SimpleConsoleExporter("WARN")]);
  }
  return loggerProvider!;
}

export function AddExporters(exporters: LogRecordExporter[]) {
  if (loggerProvider) {
    loggerProvider.exporters.push(...exporters);
    return;
  }
  loggerProvider = new LoggerProvider(exporters);
}
