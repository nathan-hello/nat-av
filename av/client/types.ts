import type { RPCError, RPCNotification, NatavRPCRequest, RPCResponse } from "@av/rpc/types";

export enum RPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  // Custom application errors
  DeviceNotFound = -32001,
  DeviceMethodNotFound = -32002,
  DeviceCallFailed = -32003,
}

// Type guard helpers
export function isRPCRequest(msg: any): msg is NatavRPCRequest {
  return (
    msg &&
    msg.jsonrpc === "2.0" &&
    msg.id !== undefined &&
    msg.params &&
    typeof msg.method === "string"
  );
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
  return msg && msg.jsonrpc === "2.0" && msg.method === "notification" && msg.params !== undefined;
}

// Helper to create error responses
export function createRPCError(
  id: string | number | null,
  code: RPCErrorCode,
  message: string,
  data?: any,
): RPCError {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

// Helper to create success responses
export function createRPCResponse<T>(id: string | number, result: T): RPCResponse<T> {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

// Helper to create notifications
export function createRPCNotification<T>(params: T): RPCNotification<T> {
  return {
    jsonrpc: "2.0",
    method: "notification",
    params,
  };
}
