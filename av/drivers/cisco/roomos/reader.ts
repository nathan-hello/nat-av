import type { RoomOS } from "@av/drivers/cisco/roomos/types";
import { RPCNotification, RPCResponse } from "@av/rpc/protocol";
import type { Format } from "@av/types";

const JsonRpc = {
  N: {
    xFeedbackEvent: {
      method: "xFeedback/Event",
      params: {
        id: "Id",
      },
    },
  },
  E: {
    Codes: {
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
      ParseError: -32700,
      CommandError: 1,
      PermissionDenied: -31999,
      SubscriberCountExceeded: -31998,
      NotReady: -31997,
    },
  },
};

function FromJsonRpcResponse(
  request: RoomOS.WriteOperation & { id: number },
  data: unknown,
  subscriptions: RoomOS.HeldSubscriptions,
): RoomOS.ReadOperation | null {
  const response = RPCResponse.is(data);
  if (!response) {
    return null;
  }

  response.id;

  return null;
}

function FromJsonRpcNotification(
  data: unknown,
  subscriptions: RoomOS.HeldSubscriptions,
): RoomOS.ReadOperation | null {
  const notification = RPCNotification.is(data);
  if (!notification) {
    return null;
  }

  if (notification.method === JsonRpc.N.xFeedbackEvent.method) {
    if (JsonRpc.N.xFeedbackEvent.params.id in notification.params) {
      const ret: RoomOS.ReadOperation = {
        update: getLeaves(notification.params),
      };
    }
  }

  return null;
}

function getLeaves(
  obj: unknown,
  currentPath: string[] = [],
): {
  path: string[];
  value: unknown;
}[] {
  if (typeof obj !== "object" || obj === null) {
    return [{ path: currentPath, value: obj }];
  }

  return Object.entries(obj).flatMap(([key, value]) =>
    getLeaves(value, [...currentPath, key]),
  );
}
