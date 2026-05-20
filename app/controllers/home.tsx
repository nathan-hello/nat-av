import type { BuildAction } from "remix/fetch-router";
import type { routes } from "@/routes";
import { render } from "@/utils/render";
import { Document } from "@/ui/document";

export const home: BuildAction<"GET", typeof routes.home> = {
  handler({ request }) {
    return render(
      <Document title="Home Page">
        <div id="spa-home" />
      </Document>,
      request,
    );
  },
};
