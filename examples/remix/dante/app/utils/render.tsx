import type { RemixNode } from "remix/ui";
import { renderToStream } from "remix/ui/server";

export function render(node: RemixNode, request: Request, init?: ResponseInit) {
  const stream = renderToStream(node, { frameSrc: request.url });

  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }

  return new Response(stream, { ...init, headers });
}
