import { createAction, createRouter } from "remix/fetch-router";
import { assets } from "@/assets";
import { routes } from "@/routes";
import { Document } from "@/ui/document";
import { render } from "@/utils/render";

export const router = createRouter();

router.get(routes.assets, async ({ request }) => {
  const response = await assets.fetch(request);
  return response ?? new Response("Not Found", { status: 404 });
});

router.map(
  routes.home,
  createAction(routes.home, ({ request }) =>
    render(
      <Document title="Dante Router">
        <div id="app" />
      </Document>,
      request,
    ),
  ),
);
