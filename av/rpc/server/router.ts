import type { NatavRPCRequest, RPCError, RPCResponse } from "@av/rpc/types";
import { createRPCError, RPCErrorCode } from "@av/rpc/utils";

export interface RPCRequestHandler {
  prefix: string;
  handle(message: NatavRPCRequest): Promise<RPCResponse | RPCError>;
}

export class RPCRequestRouter {
  constructor(private handlers: RPCRequestHandler[]) {}

  async handle(message: NatavRPCRequest): Promise<RPCResponse | RPCError> {
    const handler = this.handlers.find((candidate) => message.method.startsWith(candidate.prefix));
    if (!handler) {
      return createRPCError(message.id, RPCErrorCode.MethodNotFound, message.method);
    }

    return handler.handle(message);
  }
}
