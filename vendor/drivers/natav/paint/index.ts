import { Err } from "@av/client";
import { Driver } from "@av/drivers";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const DATA_URL_PREFIX = "data:image/png;base64,";

type PaintConfig = { width: number; height: number };

type PaintState = PaintConfig & {
  saveCount: number;
  lastFrameAt: number | null;
};

type State<N extends string> = {
  outputDir: string;
  paints: Record<N, PaintState>;
};

export class Paint<const Names extends string = string> extends Driver<
  "paint",
  [],
  {
    saveFrame: (params: { name: Names; dataUrl: string }) => Promise<{
      saveCount: number;
      path: string;
    }>;
    clear: (params: { name: Names }) => Promise<void>;
  },
  State<Names>
> {
  private outputDir: string;
  state: State<Names>;

  constructor({
    outputDir,
    paints,
  }: {
    outputDir: string;
    paints: Record<Names, PaintConfig>;
  }) {
    super({ name: "paint" });

    this.outputDir = outputDir;

    const statePaints = {} as Record<Names, PaintState>;
    for (const key in paints) {
      const cfg = paints[key];
      statePaints[key] = {
        width: cfg.width,
        height: cfg.height,
        saveCount: 0,
        lastFrameAt: null,
      };
    }

    this.state = { outputDir, paints: statePaints };
  }

  public override async start(): Promise<void> {
    await this.tel.task("paint:start", async () => {
      await fs.mkdir(this.outputDir, { recursive: true });
    });
  }

  api = {
    saveFrame: (params: {
      name: Names;
      dataUrl: string;
    }): Promise<{ saveCount: number; path: string }> => {
      return this.wrap("paint:save-frame", async () => {
        this.requireName(params?.name);
        if (
          typeof params?.dataUrl !== "string" ||
          !params.dataUrl.startsWith(DATA_URL_PREFIX)
        ) {
          throw new Error("saveFrame requires a png data url", {
            cause: Err.Codes.RpcInvalidParams,
          });
        }

        const name = params.name;
        const path = join(this.outputDir, `${name}.png`);
        const buffer = Buffer.from(
          params.dataUrl.slice(DATA_URL_PREFIX.length),
          "base64",
        );
        await fs.writeFile(path, buffer);
        this.state.paints[name].saveCount++;
        this.state.paints[name].lastFrameAt = Date.now();
        this.dispatch("driver:state-updated", { data: this.state });
        return { saveCount: this.state.paints[name].saveCount, path };
      });
    },

    clear: (params: { name: Names }): Promise<void> => {
      return this.wrap("paint:clear", async () => {
        this.requireName(params?.name);
        const name = params.name;
        const path = join(this.outputDir, `${name}.png`);
        await fs.unlink(path).catch(() => {});
        this.state.paints[name].saveCount = 0;
        this.state.paints[name].lastFrameAt = null;
        this.dispatch("driver:state-updated", { data: this.state });
      });
    },
  };

  private requireName(name: unknown): asserts name is Names {
    if (typeof name !== "string" || !(name in this.state.paints)) {
      throw new Error(`unknown paint name: ${String(name)}`, {
        cause: Err.Codes.RpcInvalidParams,
      });
    }
  }

  private async wrap<R>(label: string, fn: () => Promise<R>): Promise<R> {
    const result = await this.tel.task(label, fn);
    if (result.ok) return result.data;
    throw result.error;
  }
}
