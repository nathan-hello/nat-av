import { Err } from "@nat-av/core";
import type { RoomOS } from "./src/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function CheckError(error: unknown): RoomOS.Error {
  const outer = isRecord(error) && "error" in error ? error.error : error;
  const shape = isRecord(outer) ? outer : undefined;
  const code =
    typeof shape?.code === "number" ? shape.code : Err.Codes.DriverCallFailed;
  const message =
    typeof shape?.message === "string" ?
      shape.message
    : error instanceof globalThis.Error ?
      error.message
    : String(error);

  return {
    code,
    message,
    ...(shape && "data" in shape ? { data: shape.data } : {}),
  };
}
