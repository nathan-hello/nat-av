import { createRoot } from "remix/ui";
import { App } from "@/ui/app";

const container = document.getElementById("app");
if (container) {
  createRoot(container).render(<App />);
}
