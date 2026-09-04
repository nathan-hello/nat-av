import type { Id, JsonValue } from "./index";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJson(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJson);
  }

  if (isObject(value)) {
    return Object.values(value).every(isJson);
  }

  return false;
}

export class Response<T extends JsonValue = JsonValue> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public id: Id,
    public result: T,
  ) {}

  static is(message: unknown): Response | null {
    if (
      !isObject(message) ||
      message.jsonrpc !== "2.0" ||
      (typeof message.id !== "string" && typeof message.id !== "number") ||
      !("result" in message) ||
      !isJson(message.result)
    ) {
      return null;
    }

    return new Response(message.id, message.result);
  }
}
