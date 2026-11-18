import * as path from "node:path";
import { createAssetServer } from "remix/assets";

// The asset server serves dependencies by their resolved paths, and pnpm
// links every dependency into the workspace root: third-party packages from
// node_modules/.pnpm and @nat-av/* packages from packages/*/.dist.
const workspaceRoot = "../../..";

export const assets = createAssetServer({
  basePath: "/assets",
  rootDir: path.resolve(import.meta.dirname, ".."),
  fileMap: {
    "app/*path": "app/*path",
    "workspace/*path": `${workspaceRoot}/*path`,
  },
  allow: [
    "./app/assets/**",
    "./app/state/**",
    "./app/ui/**",
    `${workspaceRoot}/node_modules/.pnpm/**`,
    `${workspaceRoot}/packages/**/.dist/**`,
  ],
  deny: ["app/**/*.server.*", "./**/server/**"],
  sourceMaps: process.env.NODE_ENV === "development" ? "external" : undefined,
  scripts: {
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV ?? "development",
      ),
    },
  },
});
