import { RPCRequest, RPCError, RPCResponse } from "@av/rpc/protocol";
import { RPCErrorCodes } from "@av/rpc/protocol";

export interface RPCRequestHandler {
  prefix: string;
  handle(message: RPCRequest): Promise<RPCResponse | RPCError>;
}

export class RPCRequestRouter {
  constructor(private handlers: RPCRequestHandler[]) {}

  async handle(message: RPCRequest): Promise<RPCResponse | RPCError> {
    const handler = this.handlers.find((candidate) => message.method.startsWith(candidate.prefix));
    if (!handler) {
      return new RPCError(message.id, { code: RPCErrorCodes.MethodNotFound, message: message.method });
    }

    return handler.handle(message);
  }
}
