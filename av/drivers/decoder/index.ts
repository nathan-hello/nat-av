import { Delimiters } from "@av/sockets/delimiters";
import type { DeviceSocket } from "@av/types";
import {
  type AudioRoute,
  type DecoderMap,
  type DecoderNotification,
  type DecoderRequest,
  type DecoderResponse,
  type FetchContextResponse,
  type FetchRoutesResponse,
  type MoveWindowArgs,
  type RouteDestroyRequest,
  type RouteRequest,
  type VideoRoute,
  type VideoRouteMinArgs,
  type DecoderRoutes,
  type JsonRpcId,
} from "./types";
import { Driver } from "../../driver";
import { TypedEventTarget } from "../../lib/eventtarget";
import { RPCErrorData } from "../../rpc/types";

class Pending extends TypedEventTarget<{ [x: JsonRpcId]: DecoderResponse }> {
  public requests = new Map<string | number, DecoderRequest>();
}

export default class Decoder<const N extends string = string> extends Driver<N> {
  private TIMEOUT_TIME_MS = 10000;
  private highestId = 0;
  private rxBuf = Buffer.alloc(0);
  private routes: DecoderRoutes = {
    audio: [],
    video: [],
  };
  private context: FetchContextResponse["result"] | null = null;
  private debug = false;

  mock = undefined;
  socket: DeviceSocket;

  private pending = new Pending();

  constructor({ name, socket }: { name: N; socket: DeviceSocket }) {
    super({ name, driverName: "natalie-decoder" });
    this.socket = socket;

    socket.on("connected", async () => {
      await this.api.fetchContext();
      await this.api.fetchRoutes();
    });

    socket.on("receive", (chunk) => {
      this.tel.info("RECEIVE_HANDLER_CALLED", { chunkLength: chunk.length });
      this.rxBuf = Buffer.concat([this.rxBuf, chunk]);

      while (true) {
        if (this.rxBuf.length < 4) return;

        const len = this.rxBuf.readUInt32BE(0);
        if (this.rxBuf.length < 4 + len) return;

        const payload = this.rxBuf.subarray(4, 4 + len);
        this.rxBuf = this.rxBuf.subarray(4 + len);

        const response = Delimiters.json<DecoderResponse | DecoderNotification>()(payload);
        if (response === null) {
          this.tel.error("BAD_JSON_FRAME", { payload: payload.toString("utf8") });
          continue;
        }

        this.tel.info("PARSED_MESSAGE", { received: JSON.stringify(response) });

        if (!("id" in response)) {
          this.tel.debug("got-jsonrpc-notification", { notification: response });
          return;
        }

        const request = this.pending.requests.get(response.id);
        if (!request) {
          this.tel.error("response-no-id", { response: response });
          throw new RPCErrorData({
            code: 500,
            message: "response-no-id",
            data: { response, pending: this.pending.requests.keys() },
          });
        }

        this.pending.requests.delete(response.id);
        this.pending.dispatch(response.id, response);

        if (typeof response.result === "number" && response.result !== 0) {
          this.tel.error("error-from-device", { request, response });
        }
        let result;

        switch (request.method) {
          case "fetch_routes":
            result = this.processFetchRoutes(response as FetchRoutesResponse, this.routes);
            this.dispatch("driver:state-updated", { routes: result.data });
            return;
          case "fetch_context":
            this.context = (response as FetchContextResponse).result;
            this.dispatch("driver:state-updated", { context: this.context });
            return;
          case "route":
            result = this.processRoute(request, this.routes);
            this.dispatch("driver:state-updated", { routes: result.data });
            return;
          case "route_destroy":
            result = this.processRouteDestroy(request, this.routes);
            this.dispatch("driver:state-updated", { routes: result.data });
            return;
          case "debug_toggle":
            this.debug = !this.debug;
            result = response;
            this.dispatch("driver:state-updated", { debug: this.debug });
            return;
        }
      }
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
    const result = await this.tel.task("REQUEST", async () => {
      this.pending.requests.set(req.id, req);

      const payload = JSON.stringify(req);
      const len = Buffer.byteLength(payload, "utf8");
      const buf = Buffer.alloc(4 + len);

      buf.writeUint32BE(len, 0);
      buf.write(payload, 4);

      this.socket.write(buf);

      return this.pending.once(req.id.toString(), {
        signal: AbortSignal.timeout(this.TIMEOUT_TIME_MS),
      });
    });

    if (result.ok) return result.data;
    throw new RPCErrorData({ code: 400, message: result.error });
  }

  api = {
    debug: (b?: boolean) => {
      if (b === undefined || this.debug !== b) {
        return this.request({
          jsonrpc: "2.0",
          method: "debug_toggle",
          params: [],
          id: this.highestId++,
        });
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

      return this.request({
        jsonrpc: "2.0",
        method: "route",
        params,
        id: this.highestId++,
      });
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
      return this.request({
        jsonrpc: "2.0",
        method: "fetch_context",
        params: [],
        id: this.highestId++,
      });
    },

    fetchRoutes: () => {
      return this.request({
        jsonrpc: "2.0",
        method: "fetch_routes",
        params: [],
        id: this.highestId++,
      });
    },

    unroute: (
      r: { video: { output: number; window: number }[]; audio: { output: number }[] } | "all",
    ) => {
      if (r === "all") {
        return this.request({
          jsonrpc: "2.0",
          method: "route_destroy",
          params: { video: this.routes.video.flat(), audio: this.routes.audio },
          id: this.highestId++,
        });
      }
      return this.request({
        jsonrpc: "2.0",
        method: "route_destroy",
        params: r,
        id: this.highestId++,
      });
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
