import { Delimiters } from "@av/sockets/delimiters";
import { RequestManager } from "@av/lib/requests";
import type { Sockets } from "@av/types";
import {
  type AudioRoute,
  type DecoderMap,
  type DecoderNotification,
  type DecoderRequest,
  type DecoderResponse,
  type FetchContextResponse,
  type MoveWindowArgs,
  type VideoRoute,
  type DecoderRoutes,
} from "./types";
import { Driver } from "@av/drivers";
import { RPCErrorData } from "@av/rpc/protocol";
import { DecoderSchema } from "@av/drivers/decoder/schema";

type DecoderMessage = DecoderResponse | DecoderNotification;

export default class Decoder<
  const N extends string = string,
> extends Driver<N> {
  private highestId = 0;
  private routes: DecoderRoutes = {
    audio: [],
    video: [],
  };
  private context: FetchContextResponse["result"] | null = null;
  private debug = false;

  mock = undefined;
  socket: Sockets.Socket;
  private requests: RequestManager<DecoderRequest, DecoderMessage>;

  constructor({ name, socket }: { name: N; socket: Sockets.Socket }) {
    super({ name, driverName: "natalie-decoder" });
    this.socket = socket;

    const { delimiter, formatter } = Delimiters.lengthPrefixedJson<
      DecoderRequest,
      DecoderMessage
    >(this.tel);

    this.requests = new RequestManager<DecoderRequest, DecoderMessage>({
      tel: this.tel,
      socket,
      formatter,
      delimiter,
      timeoutMs: 10000,
      responseStrategy: {
        strategy: "match",
        matchFn: (request, message) =>
          "id" in message && message.id === request.id,
        maxInFlight: 5,
        minGapMs: 10,
      },
    });

    this.requests.on("message", (event) => {
      if (!("id" in event)) {
        this.tel.debug("got-jsonrpc-notification", { notification: event });
      }
    });

    socket.on("connected", async () => {
      await this.api.fetchContext();
      await this.api.fetchRoutes();
    });
  }

  schema = DecoderSchema;

  get state() {
    return {
      routes: this.routes,
      debug: this.debug,
      context: this.context,
    };
  }

  private async request<Method extends keyof DecoderMap>(
    method: Method,
    params: DecoderMap[Method]["req"]["params"],
  ): Promise<DecoderMap[Method]["res"]> {
    const req = {
      jsonrpc: "2.0",
      method,
      params,
      id: this.highestId++,
      // TSAS: Typescript doesn't know that "method" and "params" are connected
    } as DecoderMap[Method]["req"];

    const result = await this.requests.request<DecoderMap[Method]["res"]>(req);
    if (!result.ok) {
      throw new RPCErrorData({ code: 400, message: result.error });
    }

    if (typeof result.data.result === "number" && result.data.result !== 0) {
      this.tel.error("error-from-device", {
        request: req,
        response: result.data,
      });
    }

    this.dispatch("driver:delimited", Buffer.from(JSON.stringify(result.data)));

    return result.data;
  }

  api = {
    debug: async (b?: boolean) => {
      if (b === undefined || this.debug !== b) {
        const response = await this.request("debug_toggle", []);
        this.debug = !this.debug;
        this.dispatch("driver:state-updated", { data: { debug: this.debug } });
        return response.result;
      }
      return 0;
    },
    route: async (r: { video?: VideoRoute; audio?: AudioRoute }) => {
      let params: { video: VideoRoute[]; audio: AudioRoute[] } = {
        audio: [],
        video: [],
      };
      let next: DecoderRoutes | undefined;
      if (r.video !== undefined) {
        const output = this.context?.video?.find(
          (v) => v.output === r.video?.output,
        );
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

      next = {
        audio: this.routes.audio.slice(),
        video: this.routes.video.slice(),
      };

      if (params.video[0] !== undefined) {
        const v = params.video[0];
        if (next.video[v.output] === undefined) {
          next.video[v.output] = [];
        } else {
          next.video[v.output] = next.video[v.output].slice();
        }
        next.video[v.output][v.window] = v;
      }

      if (params.audio[0] !== undefined) {
        const a = params.audio[0];
        next.audio[a.output] = a;
      }

      const response = await this.request("route", params);
      this.routes = next;
      this.dispatch("driver:state-updated", { data: { routes: next } });
      return response.result;
    },

    moveRelative: async (v: MoveWindowArgs) => {
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

    moveAbsolute: async (v: MoveWindowArgs) => {
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

    fetchContext: async () => {
      if (this.mock === null) {
        throw new RPCErrorData({
          code: 401,
          message: "output-or-monitor-not-found",
          data: this.context,
        });
      }
      const response = await this.request("fetch_context", []);
      this.context = response.result;
      this.dispatch("driver:state-updated", {
        data: { context: this.context },
      });
      return response.result;
    },

    fetchRoutes: async () => {
      const response = await this.request("fetch_routes", []);
      const routes: DecoderRoutes = {
        audio: [],
        video: [],
      };

      response.result.video.forEach((v) => {
        if (routes.video[v.output] === undefined) {
          routes.video[v.output] = [];
        }
        routes.video[v.output][v.window] = v;
      });

      response.result.audio.forEach((v) => {
        routes.audio[v.output] = v;
      });

      this.routes = routes;
      this.dispatch("driver:state-updated", { data: routes });
      return response.result;
    },

    unroute: async (
      r:
        | {
            video: { output: number; window: number }[];
            audio: { output: number }[];
          }
        | "all",
    ) => {
      if (r === "all") {
        const response = await this.request("route_destroy", {
          video: this.routes.video.flat(),
          audio: this.routes.audio,
        });
        this.routes = { audio: [], video: [] };
        this.dispatch("driver:state-updated", {
          data: { routes: this.routes },
        });
        return response.result;
      }
      const response = await this.request("route_destroy", r);
      const next: DecoderRoutes = {
        audio: this.routes.audio.slice(),
        video: this.routes.video.slice(),
      };

      r.video.forEach((v) => {
        if (next.video[v.output] !== undefined) {
          next.video[v.output] = next.video[v.output].slice();
          delete next.video[v.output][v.window];
        }
      });
      r.audio.forEach((v) => {
        delete next.audio[v.output];
      });

      this.routes = next;
      this.dispatch("driver:state-updated", { data: { routes: next } });
      return response.result;
    },
  };
}
