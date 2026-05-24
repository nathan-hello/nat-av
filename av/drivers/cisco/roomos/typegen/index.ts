const INDEXED_SEGMENT = /\[[^\]]*\]/g;
const NUMERIC_SEGMENT = /^\d+$/;

export function stripIndex(segment: string): string {
  return segment.replace(INDEXED_SEGMENT, "");
}

export function isNumericSegment(segment: string): boolean {
  return NUMERIC_SEGMENT.test(segment);
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

    parts.push(stripIndex(segment));
  }

  return parts.join(separator);
}

export function renderPath(path: readonly string[]): string {
  return renderSegments(path, " ");
}

export function renderQueryPath(path: readonly string[]): string {
  return `/${renderSegments(path, "/")}`;
}

export function toRpcPath(path: readonly string[]): Array<string | number> {
  const rpcPath: Array<string | number> = [];

  for (const segment of path) {
    if (isNumericSegment(segment)) {
      rpcPath.push(Number(segment));
    } else {
      rpcPath.push(stripIndex(segment));
    }
  }

  return rpcPath;
}

export function formatValue(value: unknown): string {
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

export function formatParam(key: string, value: unknown | readonly unknown[]): string {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => `${key}: ${formatValue(item)}`).join(" ");
}

export function formatParamObject(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .flatMap((key) => {
      const value = params[key];
      return [formatParam(key, value)];
    })
    .join(" ");
}

export function rootPathName(root: "xCommand" | "xConfiguration" | "xStatus" | "xFeedback"): string {
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
