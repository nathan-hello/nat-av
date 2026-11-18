import type { Handle, RemixNode } from "remix/ui";
import { routes } from "@/routes";

export interface DocumentProps {
  children?: RemixNode;
  title?: string;
}

const baseCss = `
  *, *::before, *::after { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0;
    background: #f4f5f7;
    color: #111827;
    font: 14px/1.4 ui-sans-serif, system-ui, sans-serif;
  }
  button { font: inherit; }
`;

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const { title = "Dante Router", children } = handle.props;

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          <style>{baseCss}</style>
        </head>
        <body>
          {children}
          <script
            type="module"
            src={routes.assets.href({ path: "app/assets/entry.tsx" })}
          ></script>
        </body>
      </html>
    );
  };
}
