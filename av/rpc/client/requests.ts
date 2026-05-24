import { RPCError, RPCNotification, RPCRequest, RPCResponse } from "@av/rpc/protocol";
import type { PendingRequest } from "@av/rpc/client/types";
import type { ClientWebsocket } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";

export class ClientRpcRequests {
  private tel = new Telemetry("Rpc::Requests");
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestIdCounter = 0;
  private timeout = 30000;

  constructor(
    private transport: ClientWebsocket,
    private emitChange: () => void,
  ) {}

  nextRequestId() {
    return this.requestIdCounter++;
  }

  handleResponse(response: RPCResponse) {
    this.tel.info("got-response", response);
    this.resolvePendingRequest(response.id, response.result);
  }

  handleError(rpcError: RPCError) {
    this.tel.info("got-error", rpcError);
    if (rpcError.id === null) {
      return;
    }

    const error = new Error(rpcError.error.message);
    // TSAS:
    (error as any).code = rpcError.error.code;
    // TSAS:
    (error as any).data = rpcError.error.data;
    this.rejectPendingRequest(rpcError.id, error);
  }

  rejectAll(error: Error) {
    for (const id of this.pendingRequests.keys()) {
      this.rejectPendingRequest(id, new Error(error.message));
    }
  }

  async request<T = any>(message: RPCRequest) {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectPendingRequest(
          message.id,
          new Error(
            `RPC call timed out after ${this.timeout}ms id ${message.id}`,
          ),
        );
      }, this.timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutId,
      });
      this.emitChange();

      const str = this.tel.task("JSON_STRINGIFY", () =>
        RPCNotification.serialize(message),
      );
      if (!str.ok) {
        this.rejectPendingRequest(message.id, new Error(str.error));
        return;
      }

      const send = this.tel.task("WS_SEND", () =>
        this.transport.send(str.data),
      );
      if (!send.ok) {
        this.rejectPendingRequest(message.id, new Error(String(send.error)));
      }
    });
  }

  private async waitForOpen() {
    if (this.transport.readyState === WebSocket.OPEN) {
      return;
    }

    await this.transport.once("open");
  }

  private resolvePendingRequest(id: string | number, result: unknown) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    this.emitChange();
    pending.resolve(result);
  }

  private rejectPendingRequest(id: string | number, error: Error) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    this.emitChange();
    pending.reject(error);
  }
}
