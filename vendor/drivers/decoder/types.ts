import type { Proto } from "@av/index";

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

export type AudioRoute = {
  output: number;
  window: number;
  uri: string;
};

export type DebugToggle = Proto.JsonRpc.Request<"debug_toggle", []>;

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
export type FetchRoutesRequest = Proto.JsonRpc.Request<"fetch_routes", []>;
export type FetchRoutesResponse = Proto.JsonRpc.Response<{
  video: VideoRoute[];
  audio: AudioRoute[];
}>;

/** Method: route */
export type RouteRequest = Proto.JsonRpc.Request<
  "route",
  {
    video?: VideoRoute[];
    audio?: AudioRoute[];
  }
>;
export type ExitCodeResponse = Proto.JsonRpc.Response<number>;

/** Method: fetch_context */
export type FetchContextRequest = Proto.JsonRpc.Request<"fetch_context", []>;
export type DecoderContext = {
  video: VideoOutputContext[];
  audio: AudioOutputContext[];
};
export type FetchContextResponse = Proto.JsonRpc.Response<DecoderContext>;

/** Method: route_destroy */
export type RouteDestroyRequest = Proto.JsonRpc.Request<
  "route_destroy",
  {
    video: { output: number; window: number }[];
    audio: { output: number }[];
  }
>;
export type RouteDestroyResponse = Proto.JsonRpc.Response<number>;

export type DecoderNotificationMonitorDisconnected = Proto.JsonRpc.Notification<
  "monitor_disconnected",
  number[]
>;

export type DecoderNotificationMonitorConnected = Proto.JsonRpc.Notification<
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
