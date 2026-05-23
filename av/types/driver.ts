import type { SocketEventMap } from "@av/types/socket";

export type DriverEvents<StateData = any> = {
  "driver:state-updated": Partial<StateData>;
  "driver:delimited": Buffer;
  "socket:bubbled": SocketEventMap;
};
