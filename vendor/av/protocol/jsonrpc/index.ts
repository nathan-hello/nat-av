export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Id = string | number;

export { Request } from "./request";
export { Response } from "./response";
export { Error } from "./error";
export { Notification } from "./notification";
