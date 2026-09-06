import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const destination = resolve("examples/remix/local-install/vendor");
mkdirSync(destination, { recursive: true });

const packages = [
  "@nat-av/core",
  "@nat-av/driver-bewinner-relay-board",
  "@nat-av/driver-cisco-roomos",
  "@nat-av/driver-dante-router",
  "@nat-av/driver-nat-decoder",
  "@nat-av/driver-nat-decoder-video-wall",
  "@nat-av/driver-paint",
  "@nat-av/plugins",
  "@nat-av/plugin-debugger",
  "@nat-av/plugin-schema",
];

for (const packageName of packages) {
  execFileSync(
    "pnpm",
    ["--filter", packageName, "pack", "--pack-destination", destination],
    {
      stdio: "inherit",
    },
  );
}
