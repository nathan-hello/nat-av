import { Driver } from "@av/drivers";
import type { Drivers } from "@av/types";
import type Decoder from "@drivers/decoder";
import config from "@drivers/decoder/config";
import { DisplaySchema } from "@drivers/decoder/display/schema";
import { BUILTIN_TEMPLATES } from "@drivers/decoder/display/templates/1x1/templates";
import type { GridTemplate } from "@drivers/decoder/display/templates/builder";
import type { VideoRoute } from "@drivers/decoder/types";

/**
 * LogicalWindow is a type to describe a window as
 * it lives on the entire canvas. It may span multiple
 * monitors on one decoder or multiple decoders. This
 * means that one LogicalWindow may have multiple
 * VideoRoute elements attached to it.
 */
export type LogicalWindow = {
  id: number;
  global: {
    resX: number;
    resY: number;
    offsetX: number;
    offsetY: number;
  };
  routes: VideoRoute[];
};

export type OutputPlacement = {
  outputId: number;
  resX: number;
  resY: number;
  canvasX: number;
  canvasY: number;
};

export type DecoderConfig = {
  driver: Decoder & { name: string };
  placement: readonly OutputPlacement[];
};

export type AudioOutputPlacement = {
  decoderIndex: number;
  output: number;
  type: string;
};

export type DisplayState = {
  canvas: { width: number; height: number };
  audioOutputs: AudioOutputPlacement[];
  windows: LogicalWindow[];
  encoders: typeof config.encoders;
  decoders: Array<DecoderConfig["driver"]["state"]>;
  template: { choices: typeof BUILTIN_TEMPLATES; state: GridTemplate };
};

type LogicalOutput = { decoderIndex: number; output: OutputPlacement };

export default class DisplayManager<
  const N extends string = string,
  const C extends readonly DecoderConfig[] = readonly DecoderConfig[],
> extends Driver<N, Drivers.Dep.FromInput<C>> {
  private configs: C;
  private loutputs: LogicalOutput[] = [];
  private lwindows: LogicalWindow[] = [];
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  socket = {
    start: () => {
      this.configs.forEach((c) => c.driver.socket.start());
    },
    end: () => {
      this.configs.forEach((c) => c.driver.socket.end());
    },
  };

  private template = BUILTIN_TEMPLATES[0];

  schema = () => {
    return DisplaySchema;
  };

  constructor(name: N, configs: C) {
    super({ name, driverName: "natalie-display-manager" });
    this.configs = configs;
    this.loutputs = this.configs.flatMap((config, decoderIndex) =>
      config.placement.map((output) => ({ decoderIndex, output })),
    );
    this.computeCanvasDimensions();
    this.checkOverlaps();
    this.subscribeToDecoders();
    this.deps.set(this.configs);
  }

  get state(): DisplayState {
    return {
      canvas: { width: this.canvasWidth, height: this.canvasHeight },
      audioOutputs: this.configs.flatMap(
        (config, decoderIndex) =>
          config.driver.state.context?.audio.map((output) => ({
            decoderIndex,
            output: output.output,
            type: output.type,
          })) ?? [],
      ),
      windows: this.lwindows,
      encoders: config.encoders,
      decoders: this.configs.map((c) => c.driver.state),
      template: {
        choices: BUILTIN_TEMPLATES,
        state: this.template,
      },
    };
  }

  api = {
    changeTemplate: async (t: GridTemplate) => {
      const gridCols = t.dimensions.cols;
      const gridRows = t.dimensions.rows;
      const gridUnitWidth = this.canvasWidth / gridCols;
      const gridUnitHeight = this.canvasHeight / gridRows;

      // Move existing windows to their new positions based on new template regions
      const movePromises = this.lwindows.map(async (window) => {
        const region = t.regions.find((r) => r.id === window.id);
        if (!region) {
          await this.api.destroy(window.id);
          return;
        }

        const resX = region.width * gridUnitWidth;
        const resY = region.height * gridUnitHeight;
        const offsetX = region.col * gridUnitWidth;
        // Decoder uses bottom-left origin, convert from grid's top-left
        const cssTop = region.row * gridUnitHeight;
        const offsetY = this.canvasHeight - cssTop - resY;

        return this.api.move(window.id, { resX, resY, offsetX, offsetY });
      });

      await Promise.all(movePromises);

      this.template = t;
      this.dispatch("driver:state-updated", {
        data: {
          template: { state: t, choices: BUILTIN_TEMPLATES },
        },
      });
    },
    route: async (
      windowId: number,
      uri: string,
      global: { resX: number; resY: number; offsetX: number; offsetY: number },
      z: number = windowId,
    ) => {
      const twindow = this.computeWindow(windowId, global, uri, z);

      // Group routes by decoder
      const routesByDecoder = new Map<number, VideoRoute[]>();
      for (const route of twindow.routes) {
        const found = this.findOutputForRoute(route, global);
        if (!found) continue;

        if (!routesByDecoder.has(found.decoderIndex)) {
          routesByDecoder.set(found.decoderIndex, []);
        }
        routesByDecoder.get(found.decoderIndex)!.push(route);
      }

      // Send routes to each decoder
      const results = await Promise.all(
        Array.from(routesByDecoder.entries()).map(([decoderIdx, routes]) => {
          const decoder = this.configs[decoderIdx].driver;
          return Promise.all(
            routes.map((route) => decoder.api.route({ video: route })),
          );
        }),
      );

      return results;
    },

    routeAudio: async (
      uri: string,
      output: { decoderIndex: number; output: number },
    ) => {
      const decoder = this.configs[output.decoderIndex]?.driver;
      if (!decoder) {
        return -1;
      }

      return decoder.api.route({
        audio: {
          output: output.output,
          window: 0,
          uri,
        },
      });
    },

    move: async (
      windowId: number,
      global: { resX: number; resY: number; offsetX: number; offsetY: number },
      z?: number,
    ) => {
      const existing = this.lwindows.find((w) => w.id === windowId);
      if (!existing) {
        return [[-1]];
      }

      // Get the URI from existing routes
      const uri = existing.routes[0]?.uri ?? "";
      const twindow = this.computeWindow(windowId, global, uri, z ?? windowId);

      // Group routes by decoder
      const routesByDecoder = new Map<number, VideoRoute[]>();
      for (const route of twindow.routes) {
        const found = this.findOutputForRoute(route, global);
        if (!found) continue;

        if (!routesByDecoder.has(found.decoderIndex)) {
          routesByDecoder.set(found.decoderIndex, []);
        }
        routesByDecoder.get(found.decoderIndex)!.push(route);
      }

      // Send move commands to each decoder
      const results = await Promise.all(
        Array.from(routesByDecoder.entries()).map(([decoderIdx, routes]) => {
          const decoder = this.configs[decoderIdx].driver;
          return Promise.all(
            routes.map((route) => decoder.api.moveAbsolute(route)),
          );
        }),
      );

      return results;
    },
    debug: (b?: boolean) => {
      return Promise.all(this.configs.map((c) => c.driver.api.debug(b)));
    },

    destroy: async (windowId: number | "all") => {
      if (windowId === "all") {
        return Promise.all(
          this.configs.map((c) => c.driver.api.unroute("all")),
        );
      }
      const existing = this.lwindows.find((w) => w.id === windowId);
      if (!existing) {
        return [-1];
      }

      // Group routes by decoder for destruction
      // For destroy, we use the stored global position from the existing window
      const destroyByDecoder = new Map<
        number,
        { output: number; window: number }[]
      >();
      for (const route of existing.routes) {
        const found = this.findOutputForRoute(route, existing.global);
        if (!found) continue;

        if (!destroyByDecoder.has(found.decoderIndex)) {
          destroyByDecoder.set(found.decoderIndex, []);
        }
        destroyByDecoder.get(found.decoderIndex)!.push({
          output: route.output,
          window: route.window,
        });
      }

      // Send destroy commands to each decoder
      const results = await Promise.all(
        Array.from(destroyByDecoder.entries()).map(([decoderIdx, items]) => {
          const decoder = this.configs[decoderIdx].driver;
          return decoder.api.unroute({ video: items, audio: [] });
        }),
      );

      return results;
    },
  };

  private subscribeToDecoders(): void {
    for (const { driver } of this.configs) {
      driver.on("driver:state-updated", () => {
        this.rebuildWindows();
        this.dispatch("driver:state-updated", { data: this.state });
      });
    }
  }

  private rebuildWindows(): void {
    const routesByDecoder = this.configs.map(
      (c) => c.driver.state.routes.video,
    );
    this.lwindows = this.videoRoutesToWindows(routesByDecoder);
  }

  private computeCanvasDimensions(): void {
    for (const { output } of this.loutputs) {
      this.canvasWidth = Math.max(
        this.canvasWidth,
        output.canvasX + output.resX,
      );
      this.canvasHeight = Math.max(
        this.canvasHeight,
        output.canvasY + output.resY,
      );
    }
  }

  private checkOverlaps(): void {
    for (let i = 0; i < this.loutputs.length; i++) {
      for (let j = i + 1; j < this.loutputs.length; j++) {
        const a = this.loutputs[i].output;
        const b = this.loutputs[j].output;

        const overlapX =
          a.canvasX < b.canvasX + b.resX && a.canvasX + a.resX > b.canvasX;
        const overlapY =
          a.canvasY < b.canvasY + b.resY && a.canvasY + a.resY > b.canvasY;

        if (overlapX && overlapY) {
          throw new Error(
            `Monitors overlap: decoder ${this.loutputs[i].decoderIndex} output ${a.outputId} and decoder ${this.loutputs[j].decoderIndex} output ${b.outputId}`,
          );
        }
      }
    }
  }

  /**
   * Find the output that a route belongs to, using both outputId and canvas position.
   * This is necessary because outputId is only unique per-decoder, not globally.
   */
  private findOutputForRoute(
    route: VideoRoute,
    global: { offsetX: number; offsetY: number },
  ): { decoderIndex: number; output: OutputPlacement } | undefined {
    // Reverse the offset calculation to find the expected canvas position
    const expectedCanvasX = global.offsetX - route.x;
    const expectedCanvasY = global.offsetY - route.y;

    for (const item of this.loutputs) {
      if (
        item.output.outputId === route.output &&
        item.output.canvasX === expectedCanvasX &&
        item.output.canvasY === expectedCanvasY
      ) {
        return item;
      }
    }
    return undefined;
  }

  private computeWindow(
    id: number,
    global: { resX: number; resY: number; offsetX: number; offsetY: number },
    uri: string = "",
    z: number = id,
  ): LogicalWindow {
    const routes: VideoRoute[] = [];
    const windowRight = global.offsetX + global.resX;
    const windowBottom = global.offsetY + global.resY;

    for (const { output } of this.loutputs) {
      const outputRight = output.canvasX + output.resX;
      const outputBottom = output.canvasY + output.resY;

      const overlapsX =
        global.offsetX < outputRight && windowRight > output.canvasX;
      const overlapsY =
        global.offsetY < outputBottom && windowBottom > output.canvasY;

      if (overlapsX && overlapsY) {
        routes.push({
          output: output.outputId,
          window: id,
          uri,
          x: global.offsetX - output.canvasX,
          y: global.offsetY - output.canvasY,
          z,
          width: global.resX,
          height: global.resY,
        });
      }
    }

    return { id, global, routes };
  }

  private videoRoutesToWindows(
    routesByDecoder: VideoRoute[][][],
  ): LogicalWindow[] {
    const windowsMap = new Map<number, LogicalWindow>();

    routesByDecoder.forEach((decoderRoutes, decoderIdx) => {
      decoderRoutes.forEach((outputRoutes, outputIdx) => {
        const output = this.configs[decoderIdx]?.placement.find(
          (p) => p.outputId === outputIdx,
        );
        if (!output) return;

        outputRoutes.forEach((route) => {
          if (!windowsMap.has(route.window)) {
            windowsMap.set(route.window, {
              id: route.window,
              global: {
                resX: route.width,
                resY: route.height,
                offsetX: route.x + output.canvasX,
                offsetY: route.y + output.canvasY,
              },
              routes: [route],
            });
          } else {
            windowsMap.get(route.window)!.routes.push(route);
          }
        });
      });
    });

    return Array.from(windowsMap.values());
  }
}
