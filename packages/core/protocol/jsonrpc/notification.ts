import { isJson, type JsonValue } from "./json.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
