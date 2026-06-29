import type { JsonValue } from "./index";

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

export class Notification<
  Method extends string = string,
  Params extends JsonValue = JsonValue,
> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public method: Method,
    public params: Params,
  ) {}

  static is(message: unknown): Notification | null {
    if (
      !isObject(message) ||
      message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" ||
      !("params" in message) ||
      !isObject(message.params) ||
      !isJson(message.params)
    ) {
      return null;
    }

    return new Notification(message.method, message.params);
  }
}
