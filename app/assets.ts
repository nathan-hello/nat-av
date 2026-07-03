import { createAssetServer } from "remix/assets";

export const assets = createAssetServer({
  basePath: "/assets",
  rootDir: process.cwd(),
  fileMap: {
    "app/*path": "app/*path",
    "./vendor/av/*path": "./vendor/av/*path",
    "./vendor/drivers/*path": "./vendor/drivers/*path",
    "node_modules/*path": "node_modules/*path",
  },
  allow: [
    "./app/assets/**",
    "./app/state/**",
    "./app/controllers/home/**",
    "./app/controllers/debug/**",
    "./app/rpc/**",
    "./app/spa/**",
    "./app/ui/**",
    "./vendor/av/**",
    "./vendor/drivers/**/**",
    "./node_modules/**",
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
