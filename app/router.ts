import { createRouter } from "remix/fetch-router";

import { schema } from "@av/index";
import { assets } from "./assets.ts";
import { auth } from "./controllers/auth.tsx";
import { debug } from "./controllers/debug.tsx";
import { home } from "./controllers/home.tsx";
import { routes } from "./routes.ts";

export const router = createRouter();

router.get(routes.assets, async ({ request }) => {
  let response = await assets.fetch(request);
  return response ?? new Response("Not Found", { status: 404 });
});

router.get(routes.schema, () => {
  return schema.response();
});

router.map(routes.home, home);
router.map(routes.auth, auth);
router.map(routes.debug, debug);
