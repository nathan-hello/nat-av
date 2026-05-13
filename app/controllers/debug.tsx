import type { BuildAction } from "remix/fetch-router";

import { schema } from "@av/index";

import type { routes } from "../routes.ts";
import { render } from "../utils/render.tsx";
import { DebugPage, type DebugSchema } from "./debug/page.tsx";

export const debug: BuildAction<"GET", typeof routes.debug> = {
  handler({ request }) {
    let payload = schema.toJSON() as DebugSchema;
    let initialDevice = payload.roots[0] ?? Object.keys(payload.devices)[0] ?? null;

    return render(<DebugPage schema={payload} initialDevice={initialDevice} />, request);
  },
};
