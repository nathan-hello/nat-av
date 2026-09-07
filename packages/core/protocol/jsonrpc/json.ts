export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function isJson(value: unknown): value is JsonValue {
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

  if (value !== null && typeof value === "object") {
    return Object.values(value).every(isJson);
  }

  return false;
}
