import type { TaskResult } from "@av/telemetry";
import type { DeviceSocket } from "@av/types/socket";

export type RequestSocket = Pick<DeviceSocket, "on" | "write">;

type RequestMatcher<Request, Message> = (
  request: Request,
  message: Message,
) => boolean;

export type ResponseStrategy<Request, Message> =
  | {
      strategy: "match";
      matchFn: RequestMatcher<Request, Message>;
      maxInFlight?: number;
      minGapMs?: number;
    }
  | { strategy: "blocking-queue"; minGapMs?: number };

export type PendingRequest<Request, Message> = {
  request: Request;
  resolve: (result: TaskResult<Message>) => void;
  sent: boolean;
  timeout?: ReturnType<typeof setTimeout>;
};

export type RequestEvents<Request, Message> = {
  message: Message;
  timeout: { request: Request };
  "write-error": { request: Request; error: string };
  error: {
    phase: "receive" | "match" | "send";
    error: string;
    request?: Request;
    message?: Message;
  };
};
