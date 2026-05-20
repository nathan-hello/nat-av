import type { BuildAction } from "remix/fetch-router";
import type { routes } from "@/routes";
import { render } from "@/utils/render";
import { Document } from "@/ui/document";

export const debug: BuildAction<"GET", typeof routes.debug> = {
  handler({ request }) {
    return render(
      <Document title="Natav Debug Console">
        <div id="spa-debug" />
      </Document>,
      request,
    );
  },
};
