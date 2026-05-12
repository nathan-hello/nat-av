import type { Bus } from "../../bus";
import type { WebSocketConnection } from "@av/websocket";
import {
  type ReadableLogRecord,
  ReadableLogRecordStringify,
  ReadableLogRecordToLogEntry,
} from "./types";
import fs from "node:fs";

export type ExportResult = { code: 0 };

export interface LogRecordExporter {
  export(logRecords: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void;
  shutdown(): Promise<void>;
}

export class MultiLogExporter implements LogRecordExporter {
  constructor(private exporters: (LogRecordExporter | null)[]) {}

  export(logRecords: ReadableLogRecord[], resultCallback: (result: ExportResult) => void) {
    for (const exporter of this.exporters) {
      exporter?.export(logRecords, () => {});
    }
    resultCallback({ code: 0 });
  }

  async shutdown() {
    await Promise.all(this.exporters.map((e) => e?.shutdown()));
  }
}

export class CustomExporter implements LogRecordExporter {
  constructor(private callback: (log: { record: ReadableLogRecord; asString: string }) => void) {}

  export(logRecords: ReadableLogRecord[], resultCallback: (result: ExportResult) => void) {
    for (const record of logRecords) {
      this.callback({ record, asString: ReadableLogRecordStringify(record) });
    }
    resultCallback({ code: 0 });
  }

  async shutdown() {}
}

export class FileExporter implements LogRecordExporter {
  constructor(
    private file: string,
    createFile: boolean,
  ) {
    if (createFile) {
      fs.writeFileSync(file, "", { flag: "a+" });
    }
  }

  export(logRecords: ReadableLogRecord[], resultCallback: (result: ExportResult) => void) {
    for (const record of logRecords) {
      fs.appendFileSync(this.file, ReadableLogRecordStringify(record) + "\n");
    }
    resultCallback({ code: 0 });
  }

  shutdown() {
    return Promise.resolve();
  }
}

/**
 * This is separate from the normal RPC Websocket class because
 * that class wouldn't be allowed to send logs for its BroadcastEvent
 * method. Doing so would cause an infinite loop.
 */
export class WebsocketExporter {
  private clients = new Set<WebSocketConnection>();
  private bus: Bus;
  constructor(args: { bus: Bus }) {
    this.bus = args.bus;
    this.bus.on("natav:opentelemetry:entry", (payload) => {
      const notification = ReadableLogRecordToLogEntry(payload.message.record);
      let message: string;
      try {
        message = JSON.stringify(notification);
      } catch {
        message = JSON.stringify({
          name: "UNABLE_TO_JSON_STRINGIFY_LOG",
          context: {
            traceName: "SERVER_INTERNAL",
            traceId: undefined,
            spanId: undefined,
          },
          time: new Date().toISOString().slice(11, 23),
          severity: { id: 50, text: "ERROR" },
        });
      }
      this.clients.forEach((c) => {
        if (c.readyState !== 1) {
          return;
        }
        c.send(message);
      });
    });
  }
  WsOpenHandler = (_: Event, ws: WebSocketConnection) => {
    this.clients.add(ws);
  };
  WsCloseHandler = (_: CloseEvent, ws: WebSocketConnection) => {
    this.clients.delete(ws);
  };
  WsMessageHandler = async (_: MessageEvent, __: WebSocketConnection) => {};
  WsErrorHandler = (_: Event, __: WebSocketConnection) => {};
}
