import type { ClientRpcTransport } from "@av/rpc/client/websocket";
import { Telemetry } from "@av/telemetry";
import { Rpc } from "@av/types";

export class ClientRpcRequests {
  private tel = new Telemetry("Rpc::Requests");
  private pendingRequests = new Map<
    string | number,
    Rpc.Client.PendingRequest
  >();
  private requestIdCounter = 0;
  private timeout = 30000;

  constructor(
    private transport: ClientRpcTransport,
    private emitChange: () => void,
  ) {}

  nextRequestId() {
    return this.requestIdCounter++;
  }

  handleResponse(response: Rpc.Protocol.Response) {
    this.tel.info("got-response", response);
    this.resolvePendingRequest(response.id, response.result);
  }

  handleError(rpcError: Rpc.Protocol.Error) {
    this.tel.info("got-error", rpcError);
    if (rpcError.id === null) {
      return;
    }

    const error = rpcError;
    this.rejectPendingRequest(rpcError.id, error);
  }

  rejectAll(error: Rpc.Protocol.Error) {
    for (const id of this.pendingRequests.keys()) {
      this.rejectPendingRequest(id, error);
    }
  }

  async request<T = any>(message: Rpc.Protocol.Request): Promise<T> {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectPendingRequest(
          message.id,
          new Rpc.Protocol.Error(message.id, {
            code: Rpc.Protocol.ErrorCodes.RpcTimeout,
            message: `RPC call timed out after ${this.timeout}ms id ${message.id}`,
          }),
        );
      }, this.timeout);

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutId,
      });
      this.emitChange();

      const str = this.tel.task("JSON_STRINGIFY", () =>
        Rpc.Protocol.JSON.stringify(message),
      );
      if (!str.ok) {
        this.rejectPendingRequest(message.id, str.data);
        return;
      }

      const send = this.tel.task("WS_SEND", () =>
        this.transport.send(str.data),
      );
      if (!send.ok) {
        this.rejectPendingRequest(message.id, send.data);
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

  private rejectPendingRequest(id: string | number, error: Rpc.Protocol.Error) {
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
