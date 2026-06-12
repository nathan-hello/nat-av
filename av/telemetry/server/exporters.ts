import type { ExportResult, LogRecordExporter } from "@av/telemetry/exporters";
import {
  type ReadableLogRecord,
  ReadableLogRecordStringify,
  SeverityNumber,
} from "@av/telemetry/types";
import fs from "node:fs";
import node_util from "node:util";

export class FileExporter implements LogRecordExporter {
  private minimumSeverityNumber: number;

  constructor(
    private file: string,
    createFile: boolean,
    minimumSeverity: keyof typeof SeverityNumber,
  ) {
    this.minimumSeverityNumber = SeverityNumber[minimumSeverity];

    if (createFile) {
      fs.writeFileSync(file, "", { flag: "a+" });
    }
  }

  export(
    logRecords: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ) {
    for (const record of logRecords) {
      if ((record.severityNumber ?? 0) < this.minimumSeverityNumber) continue;

      fs.appendFileSync(this.file, ReadableLogRecordStringify(record) + "\n");
    }
    resultCallback({ code: 0 });
  }

  shutdown() {
    return Promise.resolve();
  }
}

const ANSI_RESET = "\u001b[0m";
const ANSI_PURPLE = "\u001b[35m";

export class SimpleConsoleExporter implements LogRecordExporter {
  private minimumSeverityNumber: number;

  constructor(minimumSeverity: keyof typeof SeverityNumber) {
    this.minimumSeverityNumber = SeverityNumber[minimumSeverity];
  }

  export(
    logRecords: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ) {
    for (const record of logRecords) {
      if ((record.severityNumber ?? 0) < this.minimumSeverityNumber) continue;

      const scopeName = `${ANSI_PURPLE}${record.instrumentationScope.name}${ANSI_RESET}`;
      const body = node_util.inspect(record.body, {
        depth: null,
        colors: true,
      });
      const attributes = node_util.inspect(record.attributes, {
        depth: null,
        colors: true,
      });

      switch (record.severityNumber) {
        case SeverityNumber.DEBUG:
          console.debug(scopeName, body, attributes);
          break;
        case SeverityNumber.INFO:
          console.info(scopeName, body, attributes);
          break;
        case SeverityNumber.WARN:
          console.warn(scopeName, body, attributes);
          break;
        case SeverityNumber.ERROR:
          console.error(scopeName, body, attributes);
          break;
        default:
          console.log(scopeName, body, attributes);
          break;
      }

      resultCallback({ code: 0 });
    }
  }

  async shutdown() {}
}
