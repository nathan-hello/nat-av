export type JsonRpcId = string | number;

type JsonRpcRequest<M extends string, P = any> = {
  jsonrpc: "2.0";
  method: M;
  params: P;
  id: JsonRpcId;
};

type JsonRpcResponse<R = any> = {
  jsonrpc: "2.0";
  result: R;
  id: JsonRpcId;
};

type JsonRpcNotification<M extends string, R = any> = {
  jsonrpc: "2.0";
  method: M;
  params: R;
};

/** Domain Entities */
export type VideoRoute = {
  output: number;
  window: number;
  uri: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
};

export type MoveWindowArgs = {
  output: number;
  window: number;
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  height?: number;
};

export type VideoRouteMinArgs = {
  output: number;
  window?: number;
  uri: string;
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  height?: number;
};

export type AudioRoute = {
  output: number;
  window?: number;
  uri: string;
};

export type DebugToggle = JsonRpcRequest<"debug_toggle", []>;

type VideoOutputContext = {
  output: number;
  type: "hdmi" | "dp" | string;
  height: number;
  width: number;
};

type AudioOutputContext = {
  output: number;
  type: "aux" | "hdmi" | "dp" | string;
};

/** Method: fetch_routes */
export type FetchRoutesRequest = JsonRpcRequest<"fetch_routes", []>;
export type FetchRoutesResponse = JsonRpcResponse<{
  video: VideoRoute[];
  audio: AudioRoute[];
}>;

/** Method: route */
export type RouteRequest = JsonRpcRequest<
  "route",
  {
    video?: VideoRoute[];
    audio?: AudioRoute[];
  }
>;
export type ExitCodeResponse = JsonRpcResponse<number>;

/** Method: fetch_context */
export type FetchContextRequest = JsonRpcRequest<"fetch_context", []>;
export type DecoderContext = {
  video: VideoOutputContext[];
  audio: AudioOutputContext[];
};
export type FetchContextResponse = JsonRpcResponse<DecoderContext>;

/** Method: route_destroy */
export type RouteDestroyRequest = JsonRpcRequest<
  "route_destroy",
  {
    video: { output: number; window: number }[];
    audio: { output: number }[];
  }
>;
export type RouteDestroyResponse = JsonRpcResponse<number>;

export type DecoderNotificationMonitorDisconnected = JsonRpcNotification<
  "monitor_disconnected",
  number[]
>;

export type DecoderNotificationMonitorConnected = JsonRpcNotification<
  "monitor_connected",
  number[]
>;

/** Union type for all possible requests/responses */
export type DecoderRequest =
  | FetchRoutesRequest
  | RouteRequest
  | FetchContextRequest
  | RouteDestroyRequest
  | DebugToggle;

export type DecoderResponse =
  | FetchRoutesResponse
  | ExitCodeResponse
  | FetchContextResponse
  | RouteDestroyResponse;

export type DecoderNotification =
  | DecoderNotificationMonitorConnected
  | DecoderNotificationMonitorDisconnected;

export type DecoderMap = {
  fetch_routes: { req: FetchRoutesRequest; res: FetchRoutesResponse };
  route: { req: RouteRequest; res: ExitCodeResponse };
  fetch_context: { req: FetchContextRequest; res: FetchContextResponse };
  route_destroy: { req: RouteDestroyRequest; res: RouteDestroyResponse };
  debug_toggle: { req: DebugToggle; res: ExitCodeResponse };
};

export type DecoderState = {
  routes: {
    video: VideoRoute[][];
    audio: AudioRoute[];
  };
  debug: boolean;
  context: DecoderContext;
};
export type DecoderRoutes = DecoderState["routes"];
