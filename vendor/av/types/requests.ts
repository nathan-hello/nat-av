import type { TaskResult } from "@av/telemetry";
import type { Sockets } from "@av/types/socket";

export namespace Requests {
  export type Socket = Pick<Sockets.Client, "on" | "write">;

  type Matcher<Request, Message> = (
    request: Request,
    message: Message,
  ) => boolean;

  export type Strategy<Request, Message> =
    | {
        strategy: "match";
        matchFn: Matcher<Request, Message>;
        maxInFlight?: number;
        minGapMs?: number;
      }
    | { strategy: "blocking-queue"; minGapMs?: number };

  export type Pending<Request, Message> = {
    request: Request;
    resolve: (result: TaskResult<Message>) => void;
    sent: boolean;
    timeout?: ReturnType<typeof setTimeout>;
  };
}

export namespace Format {
  export namespace JsonRpc {
    export type Id = string | number;

    export type Request<M extends string = string, P = any> = {
      jsonrpc: "2.0";
      method: M;
      params: P;
      id: Id;
    };

    export type Response<R = any> = {
      jsonrpc: "2.0";
      result: R;
      id: Id;
    };

    export type Notification<M extends string = string, R = any> = {
      jsonrpc: "2.0";
      method: M;
      params: R;
    };
  }
}
