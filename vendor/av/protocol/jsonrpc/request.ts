import { Error } from "./error";
import { Response } from "./response";
import type { Id, JsonValue } from "./index";

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class Request<
  Method extends string = string,
  Params extends JsonValue = JsonValue,
  Result extends JsonValue = JsonValue,
> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public id: Id,
    public method: Method,
    public params?: Params,
  ) {}

  response(result: Result): Response<Result> {
    return new Response(this.id, result);
  }

  error(error: Error.Shape): Error {
    return new Error(error, this.id);
  }

  static is(message: unknown): Request | null {
    if (
      !isObject(message) ||
      message.jsonrpc !== "2.0" ||
      (typeof message.id !== "string" && typeof message.id !== "number") ||
      typeof message.method !== "string"
    ) {
      return null;
    }

    return new Request(
      message.id,
      message.method,
      "params" in message ? (message.params as JsonValue) : undefined,
    );
  }
}
