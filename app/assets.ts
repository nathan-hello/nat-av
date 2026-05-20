import { createAssetServer } from "remix/assets";

export const assets = createAssetServer({
  basePath: "/assets",
  rootDir: process.cwd(),
  fileMap: {
    "app/*path": "app/*path",
    "av/*path": "av/*path",
    "node_modules/*path": "node_modules/*path",
  },
  allow: [
    "app/assets/**",
    "app/state/**",
    "app/controllers/home/**",
    "app/controllers/debug/**",
    "app/rpc/**",
    "app/spa/**",
    "app/ui/**",
    "av/**",
    "node_modules/**",
  ],
  deny: ["app/**/*.server.*"],
  sourceMaps: process.env.NODE_ENV === "development" ? "external" : undefined,
  scripts: {
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    },
  },
});
