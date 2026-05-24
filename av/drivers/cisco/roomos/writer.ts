import {
  formatParamObject,
  formatValue,
  renderPath,
  renderQueryPath,
  rootPathName,
  toRpcPath,
} from "@av/drivers/cisco/roomos/typegen";

import type {
  RoomOSWriteOperation,
  TRoomOSWriter,
} from "@av/drivers/cisco/roomos/types";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asRpcPath(
  root: "xCommand" | "xConfiguration" | "xStatus" | "xFeedback",
  path: readonly string[],
) {
  return [rootPathName(root), ...toRpcPath(path.slice(1))];
}

function renderXmlPrimitive(value: unknown): string {
  switch (typeof value) {
    case "boolean":
      return value ? "True" : "False";
    case "number":
      return String(value);
    case "string":
      return escapeXml(value);
    default:
      throw new TypeError(`Invalid value ${JSON.stringify(value)}`);
  }
}

function renderXmlField(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => renderXmlField(key, item)).join("");
  }

  if (value !== null && typeof value === "object") {
    return `<${escapeXml(key)}>${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([childKey, childValue]) => renderXmlField(childKey, childValue))
      .join("")}</${escapeXml(key)}>`;
  }

  return `<${escapeXml(key)}>${renderXmlPrimitive(value)}</${escapeXml(key)}>`;
}

function renderXmlParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => renderXmlField(key, params[key]))
    .join("");
}

function withResultId(command: string, resultId?: number | string): string {
  if (resultId === undefined) {
    return command;
  }

  return `${command} | resultId="${resultId}"`;
}

function wrapBody(command: string, body: string, resultId?: number | string): string {
  const payload = `${withResultId(command, resultId)}\n${body}\n`;
  return `{${Buffer.byteLength(payload, "utf8")}} \n${payload}`;
}

function makeTerminalCommand(operation: RoomOSWriteOperation, resultId?: number | string): string {
  switch (operation.kind) {
    case "command": {
      const head = `${operation.root} ${renderPath(operation.path.slice(1))}`.trim();
      const args = operation.args ? formatParamObject(operation.args) : "";
      const command = [head, args].filter(Boolean).join(" ");
      return operation.body !== undefined ? wrapBody(command, operation.body, resultId)
      : withResultId(command, resultId);
    }
    case "get": {
      const command = `${operation.root} ${renderPath(operation.path.slice(1))}`.trim();
      return withResultId(command, resultId);
    }
    case "set": {
      const command = `${operation.root} ${renderPath(operation.path.slice(1))}: ${formatValue(operation.value)}`;
      return withResultId(command, resultId);
    }
    case "listen": {
      const query = renderQueryPath([
        rootPathName(operation.root),
        ...operation.path.slice(1),
      ]);
      return withResultId(`xfeedback register ${query}`, resultId);
    }
  }
}

function makeJsonRpc(operation: RoomOSWriteOperation, id?: number | string): string {
  switch (operation.kind) {
    case "command": {
      const method = `${operation.root}/${renderPath(operation.path.slice(1)).split(" ").join("/")}`;
      const params = {
        ...(operation.args ?? {}),
        ...(operation.body !== undefined ? { body: operation.body } : {}),
      };
      return JSON.stringify({ jsonrpc: "2.0", method, params, id });
    }
    case "get":
      return JSON.stringify({ jsonrpc: "2.0", method: "xGet", params: { Path: asRpcPath(operation.root, operation.path) }, id });
    case "set":
      return JSON.stringify({ jsonrpc: "2.0", method: "xSet", params: { Path: asRpcPath(operation.root, operation.path), Value: operation.value }, id });
    case "listen":
      return JSON.stringify({ jsonrpc: "2.0", method: "xFeedback/Subscribe", params: { Query: asRpcPath(operation.root, operation.path) }, id });
  }
}

function makeXml(operation: RoomOSWriteOperation, id?: number | string): string {
  switch (operation.kind) {
    case "command": {
      const method = `${operation.root}/${renderPath(operation.path.slice(1)).split(" ").join("/")}`;
      const args = operation.args ? renderXmlParams(operation.args) : "";
      const body = operation.body !== undefined ? `<Body>${escapeXml(operation.body)}</Body>` : "";
      return `<Command id="${escapeXml(String(id ?? ""))}" method="${escapeXml(method)}">${args}${body}</Command>`;
    }
    case "get":
      return `<Get id="${escapeXml(String(id ?? ""))}"><Path>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Path></Get>`;
    case "set":
      return `<Set id="${escapeXml(String(id ?? ""))}"><Path>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Path><Value>${escapeXml(String(operation.value))}</Value></Set>`;
    case "listen":
      return `<Subscribe id="${escapeXml(String(id ?? ""))}"><Query>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Query></Subscribe>`;
  }
}

export class RoomOSWriter implements TRoomOSWriter {
  constructor(private readonly operation: RoomOSWriteOperation) {}

  ToXml(resultId?: number | string): string {
    return makeXml(this.operation, resultId);
  }

  ToJsonRpc(id?: number | string): string {
    return makeJsonRpc(this.operation, id);
  }

  ToTerminal(resultId?: number | string): string {
    return makeTerminalCommand(this.operation, resultId);
  }

  ToHttp(sessionId: string): Request {
    return new Request("about:blank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
      body: this.ToJsonRpc(sessionId),
    });
  }
}
