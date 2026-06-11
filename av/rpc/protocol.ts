import { Rpc } from "@av/types";

type RpcId = string | number;

// Error codes following JSON-RPC 2.0 spec
export const RPCErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Custom application errors
  DeviceNotFound: -32001,
  DeviceMethodNotFound: -32002,
  DeviceCallFailed: -32003,
} as const;

export class RPCRequest {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RpcId,
    public method: string,
    public params?: unknown,
  ) {}

  systemApiParams(): { method: string; args: any[] } | null {
    if (
      this.method !== Rpc.Methods.SystemApi ||
      !this.params ||
      typeof this.params !== "object"
    ) {
      return null;
    }

    // TSAS:
    const { method, args } = this.params as {
      method?: unknown;
      args?: unknown;
    };
    if (typeof method !== "string") {
      return null;
    }

    return { method, args: Array.isArray(args) ? args : [] };
  }

  DeviceParams(): Rpc.Device.CallParams | null {
    if (
      this.method !== Rpc.Methods.DeviceCall &&
      this.method !== Rpc.Methods.DeviceSubscribe &&
      this.method !== Rpc.Methods.DeviceUnsubscribe ||
      !this.params ||
      typeof this.params !== "object"
    ) {
      return null;
    }

    // TSAS:
    const params = this.params as {
      device?: unknown;
      method?: unknown;
      args?: unknown;
    };
    if (
      typeof params.device !== "string" ||
      typeof params.method !== "string"
    ) {
      return null;
    }

    return {
      device: params.device,
      method: params.method,
      args: Array.isArray(params.args) ? params.args : [],
    };
  }

  static is(value: unknown): RPCRequest | null {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return null;
      }
    } else if (!value || typeof value !== "object") {
      return null;
    }

    if (
      value &&
      typeof value === "object" &&
      "jsonrpc" in value &&
      value.jsonrpc === "2.0" &&
      "id" in value &&
      value.id !== undefined &&
      typeof value.id === "number" &&
      "method" in value &&
      typeof value.method === "string"
    ) {
      return new RPCRequest(
        value.id,
        value.method,
        "params" in value ? value.params : undefined,
      );
    }

    return null;
  }
}

export class RPCResponse<T = Rpc.JSONValue> {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RpcId,
    public result: T,
  ) {}

  static is(value: unknown): RPCResponse | null {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return null;
      }
    } else if (!value || typeof value !== "object") {
      return null;
    }

    if (
      value &&
      typeof value === "object" &&
      "jsonrpc" in value &&
      value.jsonrpc === "2.0" &&
      "id" in value &&
      value.id !== undefined &&
      typeof value.id === "number" &&
      "result" in value &&
      typeof value.result !== "undefined" &&
      isJSONValue(value.result)
    ) {
      return new RPCResponse(value.id, value.result);
    }
    return null;
  }
}

export class RPCError {
  jsonrpc = "2.0" as const;

  constructor(
    public id: RpcId | null,
    public error: { code: number; message: string; data?: any },
  ) {}

  static is(value: unknown): RPCError | null {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return null;
      }
    } else if (!value || typeof value !== "object") {
      return null;
    }

    if (
      value &&
      typeof value === "object" &&
      "jsonrpc" in value &&
      value.jsonrpc === "2.0" &&
      "id" in value &&
      value.id !== undefined &&
      typeof value.id === "number" &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error &&
      "code" in value.error &&
      typeof value.error.code === "number" &&
      "message" in value.error &&
      typeof value.error.message === "string"
    ) {
      return new RPCError(value.id, {
        code: value.error.code,
        message: value.error.message,
        data: "data" in value.error ? value.error.data : null,
      });
    }
    return null;
  }
}

export class RPCErrorData extends Error {
  constructor(public error: { code: number; message: string; data?: any }) {
    super(error.message);
    this.name = "RPCErrorData";
  }
}

export class RPCNotification<Tc = Record<string, Rpc.JSONValue>> {
  jsonrpc = "2.0" as const;
  method: string;
  params: Tc;

  constructor(method: string, params: Tc) {
    this.method = method;
    this.params = params;
  }

  static is<
    Ti extends Record<string, Rpc.JSONValue> = Record<string, Rpc.JSONValue>,
  >(value: unknown): RPCNotification<Ti> | null {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return null;
      }
    }

    if (
      value &&
      typeof value === "object" &&
      "jsonrpc" in value &&
      value.jsonrpc === "2.0" &&
      "method" in value &&
      typeof value.method === "string" &&
      "params" in value &&
      value.params &&
      typeof value.params === "object"
    ) {
      const paramsObj = value.params as Ti;
      return new RPCNotification<Ti>(value.method, paramsObj);
    }
    return null;
  }
}

export const RPCErrors = {
  JsonParse: (id?: RpcId, data?: any) =>
    new RPCError(id ?? null, {
      message: "JSON Parse Error",
      code: RPCErrorCodes.ParseError,
      data,
    }),
  RequestInvalid: (id?: RpcId, data?: any) =>
    new RPCError(id ?? null, {
      message: "Not a JSONRPC Request",
      code: RPCErrorCodes.InternalError,
      data,
    }),
};

export function isJSONValue(value: unknown): value is Rpc.JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJSONValue);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJSONValue);
  }

  return false;
}
