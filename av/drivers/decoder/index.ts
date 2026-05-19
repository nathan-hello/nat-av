import { Delimiters } from "@av/sockets/delimiters";
import { RequestManager } from "@av/requests";
import type { DeviceSocket } from "@av/types";
import {
  type AudioRoute,
  type DebugToggle,
  type DecoderMap,
  type DecoderNotification,
  type DecoderRequest,
  type DecoderResponse,
  type FetchContextRequest,
  type FetchContextResponse,
  type FetchRoutesRequest,
  type FetchRoutesResponse,
  type MoveWindowArgs,
  type RouteDestroyRequest,
  type RouteRequest,
  type VideoRoute,
  type VideoRouteMinArgs,
  type DecoderRoutes,
} from "./types";
import { Driver } from "@av/driver";
import { RPCErrorData } from "@av/rpc/protocol";

type DecoderMessage = DecoderResponse | DecoderNotification;

export default class Decoder<const N extends string = string> extends Driver<N> {
  private TIMEOUT_TIME_MS = 10000;
  private highestId = 0;
  private routes: DecoderRoutes = {
    audio: [],
    video: [],
  };
  private context: FetchContextResponse["result"] | null = null;
  private debug = false;

  mock = undefined;
  socket: DeviceSocket;
  private requests: RequestManager<DecoderRequest, DecoderMessage>;

  constructor({ name, socket }: { name: N; socket: DeviceSocket }) {
    super({ name, driverName: "natalie-decoder" });
    this.socket = socket;

    const { delimiter, formatter } = Delimiters.lengthPrefixedJson<DecoderRequest, DecoderMessage>(
      this.tel,
    );

    this.requests = new RequestManager<DecoderRequest, DecoderMessage>({
      tel: this.tel,
      socket,
      formatter,
      delimiter,
      timeoutMs: this.TIMEOUT_TIME_MS,
      responseStrategy: {
        strategy: "match",
        matchFn: (request, message) => "id" in message && message.id === request.id,
      },
    });

    this.requests.on("message", (message) => {
      if ("id" in message) {
        this.tel.error("response-no-id", { response: message });
        return;
      }

      this.tel.debug("got-jsonrpc-notification", { notification: message });
    });

    this.requests.on("error", ({ phase, error, request, message }) => {
      this.tel.error("REQUEST_MANAGER_ERROR", { phase, error, request, message });
    });

    this.requests.on("write-error", ({ request, error }) => {
      this.tel.error("REQUEST_WRITE_ERROR", { request, error });
    });

    this.requests.on("timeout", ({ request }) => {
      this.tel.error("REQUEST_TIMEOUT", { request });
    });

    socket.on("connected", async () => {
      await this.api.fetchContext();
      await this.api.fetchRoutes();
    });
  }

  get state() {
    return {
      routes: this.routes,
      debug: this.debug,
      context: this.context,
    };
  }

  private async request<T extends DecoderRequest>(req: T): Promise<DecoderMap[T["method"]]["res"]> {
    const result = await this.requests.request<DecoderMap[T["method"]]["res"]>(req);
    if (!result.ok) {
      throw new RPCErrorData({ code: 400, message: result.error });
    }

    const response = result.data;

    if (typeof response.result === "number" && response.result !== 0) {
      this.tel.error("error-from-device", { request: req, response });
    }

    switch (req.method) {
      case "fetch_routes": {
        const next = this.processFetchRoutes(response as FetchRoutesResponse, this.routes);
        this.dispatch("driver:state-updated", { routes: next.data });
        break;
      }
      case "fetch_context":
        this.context = (response as FetchContextResponse).result;
        this.dispatch("driver:state-updated", { context: this.context });
        break;
      case "route": {
        const next = this.processRoute(req, this.routes);
        this.dispatch("driver:state-updated", { routes: next.data });
        break;
      }
      case "route_destroy": {
        const next = this.processRouteDestroy(req, this.routes);
        this.dispatch("driver:state-updated", { routes: next.data });
        break;
      }
      case "debug_toggle":
        this.debug = !this.debug;
        this.dispatch("driver:state-updated", { debug: this.debug });
        break;
    }

    return response;
  }

  api = {
    debug: (b?: boolean) => {
      if (b === undefined || this.debug !== b) {
        const request: DebugToggle = {
          jsonrpc: "2.0",
          method: "debug_toggle",
          params: [],
          id: this.highestId++,
        };
        return this.request(request);
      }
      return { jsonrpc: "2.0", result: 0, id: -1 } as const;
    },
    route: (r: { video?: VideoRouteMinArgs; audio?: AudioRoute }) => {
      let params: { video: VideoRoute[]; audio: AudioRoute[] } = { audio: [], video: [] };
      if (r.video !== undefined) {
        const output = this.context?.video?.find((v) => v.output === r.video?.output);
        if (!output) {
          throw new RPCErrorData({
            code: 401,
            message: "output-or-monitor-not-found",
            data: this.context,
          });
        }
        params.video[0] = {
          output: r.video.output,
          window: r.video.window ?? 0,
          uri: r.video.uri,
          x: r.video.x ?? 0,
          y: r.video.y ?? 0,
          width: r.video.width ?? output.width,
          height: r.video.height ?? output.height,
          z: r.video.z ?? 0,
        };
      }

      if (r.audio) {
        params.audio[0] = {
          output: r.audio.output,
          window: r.audio.window ?? 0,
          uri: r.audio.uri,
        };
      }

      const request: RouteRequest = {
        jsonrpc: "2.0",
        method: "route",
        params,
        id: this.highestId++,
      };

      return this.request(request);
    },

    moveRelative: (v: MoveWindowArgs) => {
      const current = this.routes.video[v.output]?.[v.window];
      if (!current) {
        throw new RPCErrorData({
          code: 401,
          message: "output-or-monitor-not-found",
          data: this.context,
        });
      }
      const n: VideoRoute = {
        output: v.output,
        window: v.window,
        uri: current.uri,
        x: current.x + (v.x ?? 0),
        y: current.y + (v.y ?? 0),
        z: current.z + (v.z ?? 0),
        height: current.height + (v.height ?? 0),
        width: current.width + (v.width ?? 0),
      };

      return this.api.route({ video: n });
    },

    moveAbsolute: (v: MoveWindowArgs) => {
      const current = this.routes.video[v.output]?.[v.window];
      if (!current) {
        throw new RPCErrorData({
          code: 401,
          message: "output-or-monitor-not-found",
          data: this.context,
        });
      }
      return this.api.route({ video: { ...current, ...v, uri: current.uri } });
    },

    fetchContext: () => {
      if (this.mock === null) {
        throw new RPCErrorData({
          code: 401,
          message: "output-or-monitor-not-found",
          data: this.context,
        });
      }
      const request: FetchContextRequest = {
        jsonrpc: "2.0",
        method: "fetch_context",
        params: [],
        id: this.highestId++,
      };

      return this.request(request);
    },

    fetchRoutes: () => {
      const request: FetchRoutesRequest = {
        jsonrpc: "2.0",
        method: "fetch_routes",
        params: [],
        id: this.highestId++,
      };

      return this.request(request);
    },

    unroute: (
      r: { video: { output: number; window: number }[]; audio: { output: number }[] } | "all",
    ) => {
      if (r === "all") {
        const request: RouteDestroyRequest = {
          jsonrpc: "2.0",
          method: "route_destroy",
          params: { video: this.routes.video.flat(), audio: this.routes.audio },
          id: this.highestId++,
        };

        return this.request(request);
      }
      const request: RouteDestroyRequest = {
        jsonrpc: "2.0",
        method: "route_destroy",
        params: r,
        id: this.highestId++,
      };

      return this.request(request);
    },
  };

  processFetchRoutes(response: FetchRoutesResponse, routes: DecoderRoutes) {
    response.result.video.forEach((v) => {
      if (routes.video[v.output] === undefined) {
        routes.video[v.output] = [];
      }
      routes.video[v.output][v.window] = v;
    });

    response.result.audio.forEach((v) => {
      routes.audio[v.output] = v;
    });
    return { type: "state", data: routes } as const;
  }

  processRoute(req: RouteRequest, routes: DecoderRoutes) {
    req.params.video?.forEach((v) => {
      if (routes.video[v.output] === undefined) {
        routes.video[v.output] = [];
      }
      routes.video[v.output][v.window] = v;
    });
    req.params.audio?.forEach((v) => {
      routes.audio[v.output] = v;
    });
    return { type: "state", data: routes } as const;
  }

  processRouteDestroy(request: RouteDestroyRequest, routes: DecoderRoutes) {
    request.params.video?.forEach((v) => {
      routes.video[v.output]?.splice(v.window, 1);
    });
    request.params.audio?.forEach((v) => {
      routes.audio?.splice(v.output, 1);
    });
    return { type: "state", data: routes } as const;
  }
}
