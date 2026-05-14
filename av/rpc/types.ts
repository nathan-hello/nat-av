/**
 * RPC Protocol Definition
 *
 * Implements a JSON-RPC 2.0 inspired protocol for bidirectional WebSocket communication.
 * - Client → Server: RPC calls to device APIs
 * - Server → Client: Push notifications for device state updates
 */

import type { EventPayload } from "@av/bus";

export const RPCMethods = {
  SystemApi: "system.api",
  SystemState: "system.state",
  DeviceCall: "device.call",
  Notification: "notification",
} as const;

export type NatavRPCRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
};

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
  method: typeof RPCMethods.Notification;
  params: T;
}

export type ClientRpcError<
  T extends {
    code: number;
    message: string;
    data?: any;
  } = any,
> = { error: T };
