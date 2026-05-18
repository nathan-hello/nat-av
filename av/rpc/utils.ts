import { RPCError, RPCNotification, RPCRequest, RPCResponse } from "@av/rpc/protocol";

export function isRPCRequest(msg: any): RPCRequest | undefined {
  if (
    msg &&
    msg.jsonrpc === "2.0" &&
    msg.id !== undefined &&
    typeof msg.method === "string"
    // msg.params is optional
    // msg.params !== undefined
  ) {
    return new RPCRequest(msg.id, msg.method, msg.params);
  }
  return;
}

export function isRPCResponse(msg: any): msg is RPCResponse {
  return msg && msg.jsonrpc === "2.0" && msg.id !== undefined && msg.result !== undefined;
}

export function isRPCError(msg: any): msg is RPCError {
  return (
    msg &&
    msg.jsonrpc === "2.0" &&
    msg.id !== undefined &&
    msg.error &&
    typeof msg.error.code === "number" &&
    typeof msg.error.message === "string"
  );
}

export function isRPCNotification(msg: any): msg is RPCNotification {
  return (
    msg && msg.jsonrpc === "2.0" && msg.method === "notification"
    // msg.params is optional
    // msg.params !== undefined
  );
}

// Helper to create error responses
export const WebsocketErrorCodes = {
  1000: { name: "Normal Closure", meaning: "Clean shutdown, both sides agreed" },
  1001: {
    name: "Going Away",
    meaning: "Server shutting down or navigating away",
  },
  1002: {
    name: "Protocol Error",
    meaning: "Malformed frame, protocol violation",
  },
  1003: {
    name: "Unsupported Data",
    meaning: "Server cannot handle the data type",
  },
  1006: {
    name: "Abnormal Close",
    meaning: "Network dropped, no close frame received",
  },
  1008: {
    name: "Policy Violation",
    meaning: "Auth failed, invalid origin, banned",
  },
  1011: {
    name: "Internal Error",
    meaning: "Server hit an unexpected condition",
  },
  1012: {
    name: "Service Restart",
    meaning: "Server is restarting, come back soon",
  },
  1013: {
    name: "Try Again Later",
    meaning: "Server is overloaded, back off",
  },
} as const;

export function DecodeWebsocketError(code: number): string {
  if (code in WebsocketErrorCodes) {
    return WebsocketErrorCodes[code as keyof typeof WebsocketErrorCodes].meaning;
  }
  return "Unknown Close Code";
}
