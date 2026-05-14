import { RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import { RPCErrorCode } from "@av/rpc/utils";

export interface RPCRequestHandler {
  prefix: string;
  handle(message: RPCRequest): Promise<RPCResponse | RPCError>;
}

export class RPCRequestRouter {
  constructor(private handlers: RPCRequestHandler[]) {}

  async handle(message: RPCRequest): Promise<RPCResponse | RPCError> {
    const handler = this.handlers.find((candidate) => message.method.startsWith(candidate.prefix));
    if (!handler) {
      return new RPCError(message.id, { code: RPCErrorCode.MethodNotFound, message: message.method });
    }

    return handler.handle(message);
  }
}
