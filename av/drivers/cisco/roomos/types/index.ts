import type { TCommand } from "./transmit/xCommand";

export type TMapToX = {
  xCommand: TCommand;
};

export type TOutput =
  | { type: "terminal"; getResultId?: () => number }
  | { type: "xml"; getResultId?: () => number }
  | { type: "jsonrpc"; getId: () => number }
  | { type: "http"; getSessionId: () => string };

export interface TRoomOSWriter {
  ToXml(resultId?: number): string;
  ToJsonRpc(resultId?: number): string;
  ToTerminal(resultId?: number): string;
  ToHttp(SessionId: string): Request;
}

export type TArgument = Record<string, string | number | boolean>;

type Box<T> = { success: true; data: T } | { success: false; error: Error };

export type RoomOSDefaultResponse = Box<null>;
