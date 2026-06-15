import { Rpc, toString } from "@av/index";
import { RoomOS } from "./types";

function FromJsonRpcError(err: Rpc.Protocol.Error): RoomOS.ReadOperation {
  const code: RoomOS.ErrorCode =
    // TSAS: Object.keys takes out the string definitions
    (Object.keys(RoomOS.ErrorCodes) as RoomOS.ErrorCode[]).find(
      (key) => RoomOS.ErrorCodes[key] === err.error.code,
    ) ?? "CODE_NOT_FOUND";

  return {
    kind: "error",
    data: {
      message: err.error.message ?? code,
      code: err.error.code,
    },
  };
}

function FromJsonRpcResponse(
  request: RoomOS.WriteOperation,
  data: RoomOS.JsonValue,
  subscriptions: RoomOS.HeldSubscription[],
): RoomOS.ReadOperation {
  switch (request.kind) {
    case "sub":
      const psub = parse.SubOrUnsubFeedback(data);
      if (!psub) {
        return {
          kind: "error",
          data: {
            code: RoomOS.ErrorCodes.INVALID_RESPONSE,

            message: toString(data),
          },
        };
      }
      return {
        kind: "subscribed",
        data: {
          id: psub.Id,
          path: normalizeStatePath(request.path),
        },
      };
    /**
     * Expected shape of `xGet` request:
     * request:
     * { "jsonrpc": "2.0", "id": 103, "method": "xGet", "params": { "Path": ["Status", "SystemUnit", "State"] }
     * response:
     * { "jsonrpc": "2.0", "id": 103, "result": { "NumberOfActiveCalls": 0, "NumberOfInProgressCalls": 0, "NumberOfSuspendedCalls": 0 } }
     */
    case "get":
      return {
        kind: "update",
        data: { path: normalizeStatePath(request.path), value: data },
      };
    /**
     * Expected shape of an `xSet` request:
     * { "jsonrpc": "2.0", "id": 110, "result": true }
     */
    case "set":
      if (data === false) {
        return {
          kind: "error",
          data: {
            code: RoomOS.ErrorCodes.XSET_RETURNED_FALSE,
            message: toString(request),

            data: toString(data),
          },
        };
      }
      return {
        kind: "update",
        data: { path: normalizeStatePath(request.path), value: request.value },
      };
    case "unsub":
      const punsub = parse.SubOrUnsubFeedback(data);
      if (!punsub) {
        return {
          kind: "error",
          data: {
            code: RoomOS.ErrorCodes.INVALID_RESPONSE,
            message: toString(request),
            data: toString(data),
          },
        };
      }
      return {
        kind: "unsubscribed",
        data: subscriptions
          .flatMap((s) => {
            if (s.id === punsub.Id) {
              return s;
            }
            return findSubTrees(request.path, subscriptions);
          })
          .filter((s) => s !== undefined),
      };
    case "command":
      return { kind: "command_response", data: data };
  }
}

function FromJsonRpcNotification(
  notification: Rpc.Protocol.Notification,
): RoomOS.ReadOperation | null {
  if (notification.method === "xFeedback/Event") {
    const params = parse.xFeedbackEvent(notification.params);
    if (!params) {
      return {
        kind: "error",
        data: {
          data: { method: notification.method, params: notification.params },
          message: "INVALID_NOTIFICATION",
          code: RoomOS.ErrorCodes.INVALID_NOTIFICATION,
        },
      };
    }

    const { Id, ...rest } = { ...params };

    const data = getEventUpdate(rest);
    return {
      kind: "update",
      data: { path: normalizeStatePath(data.path), value: data.value },
    };
  }

  return null;
}

const parse = {
  Is: {
    SubOrUnsubFeedback: (
      value: RoomOS.JsonValue,
    ): value is RoomOS.Rx.RegisterFeedback => {
      return (
        value !== null &&
        typeof value === "object" &&
        "Id" in value &&
        typeof value.Id === "number"
      );
    },
    xFeedbackEvent: (
      value: RoomOS.JsonValue,
    ): value is { Id: number & Record<string, RoomOS.JsonValue> } => {
      return (
        value !== null &&
        typeof value === "object" &&
        "Id" in value &&
        typeof value.Id === "number"
      );
    },
  },

  SubOrUnsubFeedback: (
    value: RoomOS.JsonValue,
  ): RoomOS.Rx.RegisterFeedback | null => {
    if (parse.Is.SubOrUnsubFeedback(value)) {
      return value;
    }
    return null;
  },
  xFeedbackEvent: (
    value: RoomOS.JsonValue,
  ): { Id: number & Record<string, RoomOS.JsonValue> } | null => {
    if (parse.Is.xFeedbackEvent(value)) {
      return value;
    }
    return null;
  },
};

function findSubTrees(
  targetPath: string[],
  subscriptions: RoomOS.HeldSubscription[],
): RoomOS.HeldSubscription[] {
  return subscriptions.filter(
    (sub) =>
      sub.path.length >= targetPath.length &&
      targetPath.every((segment, i) => segment === sub.path[i]),
  );
}

function getEventUpdate(
  obj: RoomOS.JsonValue,
  currentPath: string[] = [],
): {
  path: string[];
  value: RoomOS.JsonValue;
} {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { path: currentPath, value: obj };
  }

  const entries = Object.entries(obj);
  if (entries.length !== 1) {
    return { path: currentPath, value: obj };
  }

  const [key, value] = entries[0];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { path: currentPath, value: obj };
  }

  return getEventUpdate(value, [...currentPath, key]);
}

function normalizeStatePath(path: readonly string[]): string[] {
  if (path.length === 1) {
    switch (path[0]) {
      case "xConfiguration":
        return ["Configuration"];
      case "xStatus":
        return ["Status"];
      case "xFeedback":
        return ["Event"];
    }
  }

  if (path[0] === "xConfiguration" || path[0] === "xStatus") {
    return path.slice(1);
  }

  if (path[0] === "xFeedback") {
    return ["Event", ...path.slice(1)];
  }

  return [...path];
}

export const reader = {
  JsonRpc: {
    Response: FromJsonRpcResponse,
    Notification: FromJsonRpcNotification,
    Error: FromJsonRpcError,
  },
};
