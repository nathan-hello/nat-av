/**
 * RPC Protocol Definition
 *
 * Implements a JSON-RPC 2.0 inspired protocol for bidirectional WebSocket communication.
 * - Client → Server: RPC calls to device APIs
 * - Server → Client: Push notifications for device state updates
 */

import type { natav } from "@av/index";
import type { EventPayload } from "@av/bus";
import type { System } from "@av/system";

// Create a type that maps each System method to its parameters
type SystemMethodParams = {
  [K in ValidSystemMethods]: System["api"][K] extends (...args: infer Args) => any ? Args : [];
};

// Ensure all keys in System are functions - compile-time assertion
type ValidSystemMethods = keyof System["api"];

/**
 * System RPC request with method-specific parameter inference
 */
export type SystemRpcRequest<M extends ValidSystemMethods & string = ValidSystemMethods & string> =
  {
    jsonrpc: "2.0";
    id: string | number;
    method: "system";
    params: {
      call: M,
      args: SystemMethodParams[M] extends [] ? undefined : SystemMethodParams[M][0];
    };
  };

/**
 * Device RPC request — loosely typed. Strong typing is recovered
 * on the frontend via utility types applied to the concrete Configs.
 */
type DeviceApiRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: "device.call";
  params: {
    device: string;
    method: string;
    args: any[];
  };
};

type DeviceDepsRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: "device.dependents";
  params: { device: string };
};

export type NatavRPCRequest = SystemRpcRequest | DeviceDepsRpcRequest | DeviceApiRpcRequest;

export type RPCMessage = NatavRPCRequest | RPCResponse | RPCError | RPCNotification;

export interface RPCResponse<T = any> {
  jsonrpc: "2.0";
  id: string | number;
  result: T;
}

export interface RPCError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

export class RPCErrorData {
  constructor(public error: { code: number; message: string; data?: any }) {}
}

export interface RPCNotification<T = EventPayload> {
  jsonrpc: "2.0";
  method: "notification";
  params: T;
}

export type ClientRpcError<
  T extends {
    code: number;
    message: string;
    data?: any;
  } = any,
> = { error: T };
