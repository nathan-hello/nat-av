import type { TRoomOSWriter } from "./types";
import type { TArgument } from "./types";

export class RoomOSWriter implements TRoomOSWriter {
  constructor(
    private path: string[],
    private args: TArgument | undefined,
  ) {}
  ToXml(resultId?: number): string {
    return "";
  }
  ToJsonRpc(resultId?: number): string {
    return "";
  }
  ToTerminal(resultId?: number): string {
    return "";
  }
  ToHttp(SessionId: string): Request {
    return new Request("");
  }
}
