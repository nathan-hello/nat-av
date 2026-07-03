import { Document } from "@/ui/document";
import { render } from "@/utils/render";
import { createAction, createRouter } from "remix/fetch-router";
import { assets } from "./assets.ts";
import { routes } from "./routes.ts";

export const router = createRouter();

router.get(routes.assets, async ({ request }) => {
  let response = await assets.fetch(request);
  return response ?? new Response("Not Found", { status: 404 });
});

router.map(
  routes.home,
  createAction(routes.home, ({ request }) => {
    return render(
      <Document title="Home Page">
        <div id="spa-home" />
      </Document>,
      request,
    );
  }),
);
