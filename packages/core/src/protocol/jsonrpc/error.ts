import type { Id, JsonValue } from "./index";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class Error {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public error: Error.Shape,
    public id?: Id | null,
  ) {}

  toString(): string {
    return `JsonRpc.Error(${this.error.code}): ${this.error.message}`;
  }

  static is(message: unknown): Error | null {
    if (
      !isObject(message) ||
      message.jsonrpc !== "2.0" ||
      !("id" in message) ||
      (message.id !== null &&
        typeof message.id !== "string" &&
        typeof message.id !== "number") ||
      !("error" in message) ||
      !isObject(message.error)
    ) {
      return null;
    }

    // TSAS: The runtime checks above guarantee keyed access to the JSON-RPC error object.
    const error = message.error as {
      code?: unknown;
      message?: unknown;
      data?: unknown;
    };

    if (typeof error.code !== "number" || typeof error.message !== "string") {
      return null;
    }

    return new Error(
      {
        code: error.code,
        message: error.message,
        // TSAS: JSON-RPC error data is optional on the wire but normalized to null for type safety.
        data: (error.data ?? null) as JsonValue,
      },
      message.id,
    );
  }
}

export namespace Error {
  export type Shape = {
    code: number;
    message: string;
    data?: JsonValue;
  };
}
