import type { Id } from "./index.js";
import { isJson, type JsonValue } from "./json.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
