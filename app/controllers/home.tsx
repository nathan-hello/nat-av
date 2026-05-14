import type { BuildAction } from "remix/fetch-router";

import type { routes } from "../routes.ts";
import { render } from "../utils/render.tsx";
import { Document } from "../ui/document.tsx";

export const home: BuildAction<"GET", typeof routes.home> = {
  handler({ request }) {
    return render(
      <Document title="Decoder Control">
        <div id="home-app" />
      </Document>,
      request,
    );
  },
};
