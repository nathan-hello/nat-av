import { DebugPage } from "@/spa/debug";
import { HomePage } from "@/spa/home";
import { createRoot, run } from "remix/ui";

const homeContainer = document.getElementById("spa-home");
if (homeContainer) {
  createRoot(homeContainer).render(<HomePage />);
}

const debugContainer = document.getElementById("spa-debug");
if (debugContainer) {
  createRoot(debugContainer).render(<DebugPage />);
}

run({
  async loadModule(moduleUrl, exportName) {
    let mod = await import(moduleUrl);
    return mod[exportName];
  },
  async resolveFrame(src, signal, target) {
    let headers = new Headers({ accept: "text/html" });
    if (target) headers.set("x-remix-target", target);

    let response = await fetch(src, {
      credentials: "same-origin",
      headers,
      signal,
    });
    return response.body ?? response.text();
  },
});
