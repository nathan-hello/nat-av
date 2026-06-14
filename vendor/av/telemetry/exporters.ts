import {
  type ReadableLogRecord,
  ReadableLogRecordStringify,
  SeverityNumber,
} from "./types";

export interface LogRecordExporter {
  export(logRecords: ReadableLogRecord[]): void;
  shutdown(): Promise<void>;
}

export class CustomExporter implements LogRecordExporter {
  constructor(
    private callback: (log: {
      record: ReadableLogRecord;
      asString: string;
    }) => void,
  ) {}

  export(logRecords: ReadableLogRecord[]) {
    for (const record of logRecords) {
      this.callback({ record, asString: ReadableLogRecordStringify(record) });
    }
  }

  async shutdown() {}
}

export class ConsoleExporter implements LogRecordExporter {
  private minimumSeverityNumber: number;

  constructor(minimumSeverity: keyof typeof SeverityNumber) {
    this.minimumSeverityNumber = SeverityNumber[minimumSeverity];
  }

  export(logRecords: ReadableLogRecord[]) {
    for (const record of logRecords) {
      if ((record.severityNumber ?? 0) < this.minimumSeverityNumber) continue;

      switch (record.severityNumber) {
        case SeverityNumber["DEBUG"]:
          console.debug(record);
          break;
        case SeverityNumber["INFO"]:
          console.info(record);
          break;
        case SeverityNumber["WARN"]:
          console.warn(record);
          break;
        case SeverityNumber["ERROR"]:
          console.error(record);
          break;
        default:
          console.log(record);
          break;
      }
    }
  }

  async shutdown() {}
}

export class SimpleConsoleExporter implements LogRecordExporter {
  private minimumSeverityNumber: number;

  constructor(minimumSeverity: keyof typeof SeverityNumber) {
    this.minimumSeverityNumber = SeverityNumber[minimumSeverity];
  }

  export(logRecords: ReadableLogRecord[]) {
    for (const record of logRecords) {
      if ((record.severityNumber ?? 0) < this.minimumSeverityNumber) continue;

      switch (record.severityNumber) {
        case SeverityNumber["DEBUG"]:
          console.debug(
            record.instrumentationScope.name,
            record.body,
            record.attributes,
          );
          break;
        case SeverityNumber["INFO"]:
          console.info(
            record.instrumentationScope.name,
            record.body,
            record.attributes,
          );
          break;
        case SeverityNumber["WARN"]:
          console.warn(
            record.instrumentationScope.name,
            record.body,
            record.attributes,
          );
          break;
        case SeverityNumber["ERROR"]:
          console.error(
            record.instrumentationScope.name,
            record.body,
            record.attributes,
          );
          break;
        default:
          console.log(record);
          break;
      }
    }
  }

  async shutdown() {}
}
