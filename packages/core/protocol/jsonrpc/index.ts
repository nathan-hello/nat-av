export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Id = string | number;

export { Error } from "./error.js";
export { Notification } from "./notification.js";
export { Request } from "./request.js";
export { Response } from "./response.js";
