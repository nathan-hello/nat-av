type RPCRequestId = string | number;

export const RPCMethods = {
  SystemApi: "system.api",
  SystemState: "system.state",
  DeviceCall: "device.call",
  Notification: "notification",
} as const;

export class RPCRequest {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RPCRequestId,
    public method: string,
    public params?: unknown,
  ) {}

  systemApiParams(): { method: string; args: any[] } | null {
    if (this.method !== RPCMethods.SystemApi || !this.params || typeof this.params !== "object") {
      return null;
    }

    const { method, args } = this.params as { method?: unknown; args?: unknown };
    if (typeof method !== "string") {
      return null;
    }

    return { method, args: Array.isArray(args) ? args : [] };
  }

  deviceCallParams(): { device: string; method: string; args: any[] } | null {
    if (this.method !== RPCMethods.DeviceCall || !this.params || typeof this.params !== "object") {
      return null;
    }

    const params = this.params as { device?: unknown; method?: unknown; args?: unknown };
    if (typeof params.device !== "string" || typeof params.method !== "string") {
      return null;
    }

    return {
      device: params.device,
      method: params.method,
      args: Array.isArray(params.args) ? params.args : [],
    };
  }
}

export class RPCResponse<T = any> {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RPCRequestId,
    public result: T,
  ) {}

  static parse(message: unknown): RPCResponse<any> | null {
    if (!message || typeof message !== "object") {
      return null;
    }

    const candidate = message as { jsonrpc?: unknown; id?: unknown; result?: unknown };
    if (candidate.jsonrpc !== "2.0" || candidate.id === undefined || !("result" in candidate)) {
      return null;
    }

    return new RPCResponse(candidate.id as RPCRequestId, candidate.result);
  }
}

export class RPCError {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RPCRequestId | null,
    public error: { code: number; message: string; data?: any },
  ) {}

  static parse(message: unknown): RPCError | null {
    if (!message || typeof message !== "object") {
      return null;
    }

    const candidate = message as {
      jsonrpc?: unknown;
      id?: unknown;
      error?: unknown;
    };

    const error = candidate.error as { code?: unknown; message?: unknown; data?: unknown } | undefined;
    if (
      candidate.jsonrpc !== "2.0" ||
      candidate.id === undefined ||
      !error ||
      typeof error.code !== "number" ||
      typeof error.message !== "string"
    ) {
      return null;
    }

    return new RPCError(candidate.id as RPCRequestId, {
      code: error.code,
      message: error.message,
      data: error.data,
    });
  }
}

export class RPCErrorData {
  constructor(public error: { code: number; message: string; data?: any }) {}
}

export class RPCNotification<T = any> {
  jsonrpc = "2.0" as const;
  method = RPCMethods.Notification;

  constructor(public params: T) {}

  static parse(message: string | unknown): RPCNotification<any> | null {
    const value = typeof message === "string" ? JSON.parse(message) : message;

    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as {
      jsonrpc?: unknown;
      method?: unknown;
      params?: unknown;
    };

    if (candidate.jsonrpc !== "2.0" || candidate.method !== RPCMethods.Notification) {
      return null;
    }

    return new RPCNotification(candidate.params);
  }

  static notification<T>(params: T) {
    return new RPCNotification(params);
  }

  static serialize(message: RPCMessage): string {
    return JSON.stringify(message);
  }

  static fromRaw(raw: string) {
    return JSON.parse(raw);
  }

  static is(value: unknown): value is RPCNotification<any> {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as {
      jsonrpc?: unknown;
      method?: unknown;
      params?: unknown;
    };

    return candidate.jsonrpc === "2.0" && candidate.method === RPCMethods.Notification;
  }
}

export type RPCMessage = RPCRequest | RPCResponse | RPCError | RPCNotification;
