import { removeBrackets } from "@av/drivers/cisco/roomos/typegen/scripts/parse";
import type { RoomOS } from "@av/drivers/cisco/roomos/types";
import type { Format } from "@av/types";

export function isNumericSegment(segment: string): boolean {
  if (segment.length === 0) {
    return false;
  }

  const zero = "0".charCodeAt(0);
  const nine = "9".charCodeAt(0);

  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i);

    if (code < zero || code > nine) {
      return false;
    }
  }

  return true;
}

function renderSegments(path: readonly string[], separator: string): string {
  const parts: string[] = [];

  for (const segment of path) {
    if (isNumericSegment(segment)) {
      if (!parts.length) {
        parts.push(`[${segment}]`);
      } else {
        parts[parts.length - 1] = `${parts[parts.length - 1]}[${segment}]`;
      }
      continue;
    }

    parts.push(removeBrackets(segment));
  }

  return parts.join(separator);
}

function renderPath(path: readonly string[]): string {
  return renderSegments(path, " ");
}

function renderQueryPath(path: readonly string[]): string {
  return `/${renderSegments(path, "/")}`;
}

function toRpcPath(path: readonly string[]): Array<string | number> {
  const rpcPath: Array<string | number> = [];

  for (const segment of path) {
    if (isNumericSegment(segment)) {
      rpcPath.push(Number(segment));
    } else {
      rpcPath.push(removeBrackets(segment));
    }
  }

  return rpcPath;
}

function formatValue(value: unknown): string {
  switch (typeof value) {
    case "boolean":
      return value ? "True" : "False";
    case "number":
    case "string":
      return JSON.stringify(value);
    default:
      throw new TypeError(`Invalid value ${JSON.stringify(value)}`);
  }
}

function formatParam(key: string, value: unknown | readonly unknown[]): string {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => `${key}: ${formatValue(item)}`).join(" ");
}

function formatParamObject(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .flatMap((key) => {
      const value = params[key];
      return [formatParam(key, value)];
    })
    .join(" ");
}

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

function withResultId(command: string, resultId: number): string {
  if (resultId === undefined) {
    return command;
  }

  return `${command} | resultId="${resultId}"`;
}

export function rootPathName(
  root: "xCommand" | "xConfiguration" | "xStatus" | "xFeedback",
): string {
  switch (root) {
    case "xCommand":
      return "Command";
    case "xConfiguration":
      return "Configuration";
    case "xStatus":
      return "Status";
    case "xFeedback":
      return "Event";
  }
}

function wrapBody(command: string, body: string, resultId: number): string {
  const payload = `${withResultId(command, resultId)}\n${body}\n`;
  return `{${Buffer.byteLength(payload, "utf8")}} \n${payload}`;
}

function ToTerminal(
  operation: RoomOS.WriteOperation,
  resultId: number,
): string {
  switch (operation.kind) {
    case "command": {
      const head =
        `${operation.root} ${renderPath(operation.path.slice(1))}`.trim();
      const args = operation.args ? formatParamObject(operation.args) : "";
      const command = [head, args].filter(Boolean).join(" ");
      return operation.body !== undefined ?
          wrapBody(command, operation.body, resultId)
        : withResultId(command, resultId);
    }
    case "get": {
      const command =
        `${operation.root} ${renderPath(operation.path.slice(1))}`.trim();
      return withResultId(command, resultId);
    }
    case "set": {
      const command = `${operation.root} ${renderPath(operation.path.slice(1))}: ${formatValue(operation.value)}`;
      return withResultId(command, resultId);
    }
    case "sub": {
      const query = renderQueryPath([
        rootPathName(operation.root),
        ...operation.path.slice(1),
      ]);
      return withResultId(`xfeedback register ${query}`, resultId);
    }
    case "unsub": {
      return withResultId(`xfeedback register ${operation.root}/${operation.path}`, resultId);
    }
  }
}

function ToJsonRpc(
  operation: RoomOS.WriteOperation,
  id: Format.JsonRpc.Id,
): string {
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
      return JSON.stringify({
        jsonrpc: "2.0",
        method: "xGet",
        params: { Path: asRpcPath(operation.root, operation.path) },
        id,
      });
    case "set":
      return JSON.stringify({
        jsonrpc: "2.0",
        method: "xSet",
        params: {
          Path: asRpcPath(operation.root, operation.path),
          Value: operation.value,
        },
        id,
      });
    case "sub":
      return JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Subscribe",
        params: {
          Query: asRpcPath(operation.root, operation.path), 
          NotifyCurrentValue: true
        },
        id,
      });
      case "unsub":
        return JSON.stringify({
        jsonrpc: "2.0",
        method: "xFeedback/Unsubscribe",
        params: {
          Id: operation
        }
      })
  }
}

function ToXml(operation: RoomOS.WriteOperation, id: number): string {
  switch (operation.kind) {
    case "command": {
      const method = `${operation.root}/${renderPath(operation.path.slice(1)).split(" ").join("/")}`;
      const args = operation.args ? renderXmlParams(operation.args) : "";
      const body =
        operation.body !== undefined ?
          `<Body>${escapeXml(operation.body)}</Body>`
        : "";
      return `<Command id="${escapeXml(String(id ?? ""))}" method="${escapeXml(method)}">${args}${body}</Command>`;
    }
    case "get":
      return `<Get id="${escapeXml(String(id ?? ""))}"><Path>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Path></Get>`;
    case "set":
      return `<Set id="${escapeXml(String(id ?? ""))}"><Path>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Path><Value>${escapeXml(String(operation.value))}</Value></Set>`;
    case "sub":
      return `<Subscribe id="${escapeXml(String(id ?? ""))}"><Query>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Query></Subscribe>`;
    case "unsub":
      return `<Unsubscribe id="${escapeXml(String(id ?? ""))}"><Query>${escapeXml(asRpcPath(operation.root, operation.path).join("/"))}</Query></Subscribe>`;
  }
}

export const RoomOSFormatter: Record<
  string,
  (operation: RoomOS.WriteOperation, id: number) => string
> = {
  ToXml,
  ToJsonRpc,
  ToTerminal,
};
