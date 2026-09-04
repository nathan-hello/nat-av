import path from "node:path";
import { defineConfig } from "vite";

const natAvRoot = path.resolve(
  import.meta.dirname,
  process.env.NAT_AV_ROOT ?? "../../../packages",
);

export default defineConfig({
  resolve: {
    alias: {
      "@nat-av/core": path.join(natAvRoot, "core/src"),
      "@nat-av/driver-cisco-roomos": path.join(natAvRoot, "drivers/cisco-roomos/src"),
      "@nat-av/driver-dante-router": path.join(natAvRoot, "drivers/dante-router/src"),
      "@nat-av/driver-decoder": path.join(natAvRoot, "drivers/decoder/src"),
      "@nat-av/driver-paint": path.join(natAvRoot, "drivers/paint/src"),
      "@nat-av/driver-bewinner-relay-board": path.join(natAvRoot, "drivers/bewinner-relay-board/src"),
      "@nat-av/plugin-debugger": path.join(natAvRoot, "plugins/debugger/src"),
      "@nat-av/core/rpc": path.join(natAvRoot, "core/src/rpc"),
      "@nat-av/plugin-schema": path.join(natAvRoot, "plugins/schema/src"),
      "@nat-av/plugin-system": path.join(natAvRoot, "plugins/system/src")
    }
  }
});
