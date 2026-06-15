import type { Events } from "@av/types";
import { Rpc } from "@av/types";

export type RpcId = string | number;
export type RPCWireValue = Rpc.JSONValue;

export type RPCErrorShape = {
  code: number;
  message: string;
  data?: unknown;
};

type RPCRequestMap = {
  [Rpc.Methods.DeviceCall]: {
    params: Rpc.Device.CallParams;
    result: RPCWireValue;
  };
  [Rpc.Methods.DeviceSubscribe]: {
    params: Rpc.Device.CallParams;
    result: null;
  };
  [Rpc.Methods.DeviceUnsubscribe]: {
    params: Rpc.Device.CallParams;
    result: null;
  };
  [Rpc.Methods.GetAllDriverStates]: {
    params: undefined;
    result: RPCWireValue;
  };
};

type RPCServerNotificationMap = {
  "natav:device:event": Events.Natav.Map["natav:device:event"];
  "natav:state:update": Events.Natav.Map["natav:state:update"];
  "natav:device:connected": Events.Natav.Map["natav:device:connected"];
  "natav:device:disconnected": Events.Natav.Map["natav:device:disconnected"];
};

type RPCKnownMethod = keyof RPCRequestMap & string;
type RPCDeviceMethod =
  | typeof Rpc.Methods.DeviceCall
  | typeof Rpc.Methods.DeviceSubscribe
  | typeof Rpc.Methods.DeviceUnsubscribe;

export type RPCRequestParams<Method extends RPCKnownMethod> =
  RPCRequestMap[Method]["params"];
export type RPCRequestResult<Method extends RPCKnownMethod> =
  RPCRequestMap[Method]["result"];

export type RPCRequestResultOf<TRequest extends RPCRequest> =
  TRequest extends RPCRequest<string, unknown, infer Result> ? Result : never;

export type RPCServerNotificationType = keyof RPCServerNotificationMap & string;
export type RPCServerNotificationParams<
  Type extends RPCServerNotificationType,
> = RPCServerNotificationMap[Type];
export type RPCServerNotificationPayload<
  Type extends RPCServerNotificationType,
> =
  & { type: Type }
  & RPCServerNotificationParams<Type>
  & Record<string, RPCWireValue>;

export type RPCKnownDeviceRequest =
  | RPCDeviceCallRequest
  | RPCDeviceSubscribeRequest
  | RPCDeviceUnsubscribeRequest;

export type RPCKnownServerNotification = {
  [Type in RPCServerNotificationType]: RPCServerNotification<Type>;
}[RPCServerNotificationType];

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

function parseMessageObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  // TSAS: After excluding null and arrays, keyed JSON-RPC field access needs a record shape.
  return value as Record<string, unknown>;
}

function isRpcId(value: unknown): value is RpcId {
  return typeof value === "string" || typeof value === "number";
}

function isJsonObject(value: unknown): value is Record<string, RPCWireValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDeviceParams(params: Rpc.Device.CallParams): Rpc.Device.CallParams {
  return {
    device: params.device,
    method: params.method,
    args: Array.isArray(params.args) ? params.args : [],
  };
}

function parseDeviceParams(value: unknown): Rpc.Device.CallParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  // TSAS: The runtime checks above ensure this params object can be inspected by key.
  const params = value as {
    device?: unknown;
    method?: unknown;
    args?: unknown;
  };

  if (typeof params.device !== "string" || typeof params.method !== "string") {
    return null;
  }

  return {
    device: params.device,
    method: params.method,
    args: Array.isArray(params.args) ? params.args : [],
  };
}

function createServerNotificationPayload<Type extends RPCServerNotificationType>(
  type: Type,
  params: RPCServerNotificationParams<Type>,
): RPCServerNotificationPayload<Type> {
  // TSAS: Event payload types are already JSON-safe, but proving the spread satisfies the generic record is noisy.
  return { type, ...params } as RPCServerNotificationPayload<Type>;
}

function isDeviceEventNotification(
  params: Record<string, unknown>,
): params is RPCServerNotificationPayload<"natav:device:event"> {
  return (
    params.type === "natav:device:event" &&
    typeof params.name === "string" &&
    typeof params.event === "string" &&
    isJSONValue(params.data)
  );
}

function isStateUpdateNotification(
  params: Record<string, unknown>,
): params is RPCServerNotificationPayload<"natav:state:update"> {
  return (
    params.type === "natav:state:update" &&
    typeof params.name === "string" &&
    isJSONValue(params.data)
  );
}

function isConnectedNotification(
  params: Record<string, unknown>,
): params is RPCServerNotificationPayload<"natav:device:connected"> {
  return (
    params.type === "natav:device:connected" && typeof params.name === "string"
  );
}

function isDisconnectedNotification(
  params: Record<string, unknown>,
): params is RPCServerNotificationPayload<"natav:device:disconnected"> {
  return (
    params.type === "natav:device:disconnected" &&
    typeof params.name === "string"
  );
}

export class RPCRequest<
  Method extends string = string,
  Params = unknown,
  Result extends RPCWireValue = RPCWireValue,
> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public id: RpcId,
    public method: Method,
    public params?: Params,
  ) {}

  response(result: Result): RPCResponse<Result> {
    return new RPCResponse(this.id, result);
  }

  error(error: RPCErrorShape): RPCError {
    return new RPCError(this.id, error);
  }

  DeviceParams(): Rpc.Device.CallParams | null {
    if (
      this.method !== Rpc.Methods.DeviceCall &&
      this.method !== Rpc.Methods.DeviceSubscribe &&
      this.method !== Rpc.Methods.DeviceUnsubscribe
    ) {
      return null;
    }

    return parseDeviceParams(this.params);
  }

  static is(value: unknown): RPCRequest | null {
    const message = parseMessageObject(value);

    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      !isRpcId(message.id) ||
      typeof message.method !== "string"
    ) {
      return null;
    }

    return new RPCRequest(
      message.id,
      message.method,
      "params" in message ? message.params : undefined,
    );
  }
}

export class RPCDeviceRequest<
  Method extends RPCDeviceMethod = RPCDeviceMethod,
> extends RPCRequest<Method, Rpc.Device.CallParams, RPCRequestMap[Method]["result"]> {
  constructor(id: RpcId, method: Method, params: Rpc.Device.CallParams) {
    super(id, method, normalizeDeviceParams(params));
  }

  static is(value: unknown): RPCKnownDeviceRequest | null {
    const request = RPCRequest.is(value);
    if (!request) {
      return null;
    }

    switch (request.method) {
      case Rpc.Methods.DeviceCall:
        return RPCDeviceCallRequest.is(request);
      case Rpc.Methods.DeviceSubscribe:
        return RPCDeviceSubscribeRequest.is(request);
      case Rpc.Methods.DeviceUnsubscribe:
        return RPCDeviceUnsubscribeRequest.is(request);
      default:
        return null;
    }
  }
}

export class RPCDeviceCallRequest extends RPCDeviceRequest<typeof Rpc.Methods.DeviceCall> {
  constructor(id: RpcId, params: Rpc.Device.CallParams) {
    super(id, Rpc.Methods.DeviceCall, params);
  }

  static is(value: unknown): RPCDeviceCallRequest | null {
    const request = RPCRequest.is(value);
    if (!request || request.method !== Rpc.Methods.DeviceCall) {
      return null;
    }

    const params = request.DeviceParams();
    return params ? new RPCDeviceCallRequest(request.id, params) : null;
  }
}

export class RPCDeviceSubscribeRequest extends RPCDeviceRequest<typeof Rpc.Methods.DeviceSubscribe> {
  constructor(id: RpcId, params: Rpc.Device.CallParams) {
    super(id, Rpc.Methods.DeviceSubscribe, params);
  }

  static is(value: unknown): RPCDeviceSubscribeRequest | null {
    const request = RPCRequest.is(value);
    if (!request || request.method !== Rpc.Methods.DeviceSubscribe) {
      return null;
    }

    const params = request.DeviceParams();
    return params ? new RPCDeviceSubscribeRequest(request.id, params) : null;
  }
}

export class RPCDeviceUnsubscribeRequest extends RPCDeviceRequest<typeof Rpc.Methods.DeviceUnsubscribe> {
  constructor(id: RpcId, params: Rpc.Device.CallParams) {
    super(id, Rpc.Methods.DeviceUnsubscribe, params);
  }

  static is(value: unknown): RPCDeviceUnsubscribeRequest | null {
    const request = RPCRequest.is(value);
    if (!request || request.method !== Rpc.Methods.DeviceUnsubscribe) {
      return null;
    }

    const params = request.DeviceParams();
    return params ? new RPCDeviceUnsubscribeRequest(request.id, params) : null;
  }
}

export class RPCResponse<T extends RPCWireValue = RPCWireValue> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public id: RpcId,
    public result: T,
  ) {}

  static from<TRequest extends RPCRequest>(
    request: TRequest,
    result: RPCRequestResultOf<TRequest>,
  ): RPCResponse<RPCRequestResultOf<TRequest>> {
    return new RPCResponse(request.id, result);
  }

  static is(value: unknown): RPCResponse | null {
    const message = parseMessageObject(value);

    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      !isRpcId(message.id) ||
      !Object.hasOwn(message, "result") ||
      !isJSONValue(message.result)
    ) {
      return null;
    }

    return new RPCResponse(message.id, message.result);
  }
}

export class RPCError {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public id: RpcId | null,
    public error: RPCErrorShape,
  ) {}

  static is(value: unknown): RPCError | null {
    const message = parseMessageObject(value);

    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      !(message.id === null || isRpcId(message.id)) ||
      !message.error ||
      typeof message.error !== "object" ||
      Array.isArray(message.error)
    ) {
      return null;
    }

    // TSAS: The runtime checks above guarantee keyed access to the JSON-RPC error object.
    const error = message.error as {
      code?: unknown;
      message?: unknown;
      data?: unknown;
    };

    if (typeof error.code !== "number" || typeof error.message !== "string") {
      return null;
    }

    return new RPCError(message.id, {
      code: error.code,
      message: error.message,
      data: error.data,
    });
  }
}

export class RPCErrorData extends Error {
  constructor(public error: RPCErrorShape) {
    super(error.message);
    this.name = "RPCErrorData";
  }
}

export class RPCNotification<
  Method extends string = string,
  Params extends Record<string, RPCWireValue> = Record<string, RPCWireValue>,
> {
  readonly jsonrpc: "2.0" = "2.0";

  constructor(
    public method: Method,
    public params: Params,
  ) {}

  static is(value: unknown): RPCNotification | null {
    const message = parseMessageObject(value);

    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" ||
      !isJsonObject(message.params) ||
      !isJSONValue(message.params)
    ) {
      return null;
    }

    return new RPCNotification(message.method, message.params);
  }
}

export class RPCServerNotification<
  Type extends RPCServerNotificationType = RPCServerNotificationType,
> extends RPCNotification<
  typeof Rpc.Methods.Notification,
  RPCServerNotificationPayload<Type>
> {
  constructor(type: Type, params: RPCServerNotificationParams<Type>) {
    super(Rpc.Methods.Notification, createServerNotificationPayload(type, params));
  }

  get type(): Type {
    return this.params.type;
  }

  static is(value: unknown): RPCKnownServerNotification | null {
    const notification = RPCNotification.is(value);
    if (!notification || notification.method !== Rpc.Methods.Notification) {
      return null;
    }

    switch (notification.params.type) {
      case "natav:device:event":
        return isDeviceEventNotification(notification.params) ?
            new RPCServerNotification("natav:device:event", {
              name: notification.params.name,
              event: notification.params.event,
              data: notification.params.data,
            })
          : null;
      case "natav:state:update":
        return isStateUpdateNotification(notification.params) ?
            new RPCServerNotification("natav:state:update", {
              name: notification.params.name,
              data: notification.params.data,
            })
          : null;
      case "natav:device:connected":
        return isConnectedNotification(notification.params) ?
            new RPCServerNotification("natav:device:connected", {
              name: notification.params.name,
            })
          : null;
      case "natav:device:disconnected":
        return isDisconnectedNotification(notification.params) ?
            new RPCServerNotification("natav:device:disconnected", {
              name: notification.params.name,
            })
          : null;
      default:
        return null;
    }
  }
}

export const RPCErrors = {
  JsonParse: (id?: RpcId, data?: unknown) =>
    new RPCError(id ?? null, {
      message: "JSON Parse Error",
      code: RPCErrorCodes.ParseError,
      data,
    }),
  RequestInvalid: (id?: RpcId, data?: unknown) =>
    new RPCError(id ?? null, {
      message: "Not a JSONRPC Request",
      code: RPCErrorCodes.InvalidRequest,
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

  if (value && typeof value === "object") {
    return Object.values(value).every(isJSONValue);
  }

  return false;
}
