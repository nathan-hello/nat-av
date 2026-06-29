export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Id = string | number;

export { Error } from "./error";
export { Notification } from "./notification";
export { Request } from "./request";
export { Response } from "./response";
