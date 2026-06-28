import { Err, Telemetry } from "@av/index";
import { Rpc } from "../types";
import type { ClientRpcTransport } from "./websocket";

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

  handleResponse(response: Rpc.Response) {
    this.tel.info("got-response", response);
    this.resolvePendingRequest(response.id, response.result);
  }

  handleError(rpcError: Rpc.Error) {
    this.tel.info("got-error", rpcError);
    if (rpcError.id === null) {
      return;
    }

    this.rejectPendingRequest(rpcError);
  }

  rejectAll(error: Rpc.Error) {
    for (const _ of this.pendingRequests.keys()) {
      this.rejectPendingRequest(error);
    }
  }

  async request<T = any>(message: Rpc.Request): Promise<T> {
    await this.waitForOpen();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectPendingRequest(
          new Rpc.Error(
            {
              code: Err.Codes.RpcTimeout,
              message: `RPC call timed out after ${this.timeout}ms id ${message.id}`,
            },
            message.id,
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
        Rpc.Json.stringify(message),
      );
      if (!str.ok) {
        this.rejectPendingRequest(new Rpc.Error(str.error, message.id));
        return;
      }

      const send = this.tel.task("WS_SEND", () =>
        this.transport.send(str.data),
      );
      if (!send.ok) {
        this.rejectPendingRequest(new Rpc.Error(send.error, message.id));
      }
    });
  }

  private async waitForOpen() {
    if (this.transport.readyState === WebSocket.OPEN) {
      return;
    }

    await this.transport.once("open");
  }

  private resolvePendingRequest(id: string | number, result: Rpc.Json.Value) {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    this.emitChange();
    pending.resolve(result);
  }

  private rejectPendingRequest(error: Rpc.Error) {
    if (!error.id) {
      return;
    }

    const pending = this.pendingRequests.get(error.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(error.id);
    this.emitChange();
    pending.reject(error);
  }
}
