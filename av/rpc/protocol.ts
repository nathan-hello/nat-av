import { RPCMethods, type NatavRPCRequest, type RPCMessage } from "@av/rpc/types";

type RPCRequestId = string | number;

export function createRPCRequest(
  id: RPCRequestId,
  method: string,
  params?: any,
): NatavRPCRequest {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

export function createSystemApiRequest(
  id: RPCRequestId,
  method: string,
  args: any[] = [],
): NatavRPCRequest {
  return createRPCRequest(id, RPCMethods.SystemApi, { method, args });
}

export function createSystemStateRequest(id: RPCRequestId): NatavRPCRequest {
  return createRPCRequest(id, RPCMethods.SystemState);
}

export function createDeviceCallRequest(
  id: RPCRequestId,
  device: string,
  method: string,
  args: any[] = [],
): NatavRPCRequest {
  return createRPCRequest(id, RPCMethods.DeviceCall, { device, method, args });
}

export function parseSystemApiParams(message: NatavRPCRequest): { method: string; args: any[] } | null {
  if (message.method !== RPCMethods.SystemApi || !message.params || typeof message.params !== "object") {
    return null;
  }

  const { method, args } = message.params as { method?: unknown; args?: unknown };
  if (typeof method !== "string") {
    return null;
  }

  return {
    method,
    args: Array.isArray(args) ? args : [],
  };
}

export function parseDeviceCallParams(
  message: NatavRPCRequest,
): { device: string; method: string; args: any[] } | null {
  if (message.method !== RPCMethods.DeviceCall || !message.params || typeof message.params !== "object") {
    return null;
  }

  const params = message.params as {
    device?: unknown;
    method?: unknown;
    args?: unknown;
  };

  if (typeof params.device !== "string" || typeof params.method !== "string") {
    return null;
  }

  return {
    device: params.device,
    method: params.method,
    args: Array.isArray(params.args) ? params.args : [],
  };
}

export function serializeRPCMessage(message: RPCMessage): string {
  return JSON.stringify(message);
}

export function parseRPCMessage(raw: string): unknown {
  return JSON.parse(raw);
}
