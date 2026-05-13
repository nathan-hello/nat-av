import { css, type Handle } from "remix/ui";

import { routes } from "../routes.ts";

const APP_DISPLAY_NAME = "Natav Remix";

export function HomePage() {
  return () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>{APP_DISPLAY_NAME}</title>
        <link rel="stylesheet" href={routes.assets.href({ path: "app/assets/tailwind.css" })} />
        <script type="module" src={routes.assets.href({ path: "app/assets/entry.ts" })}></script>
      </head>
      <body
        mix={css({
          margin: 0,
          minHeight: "100vh",
          padding: "32px 20px",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
          lineHeight: 1.5,
        })}
      >
        <main
          mix={css({
            width: "100%",
            maxWidth: "960px",
            margin: "0 auto",
            display: "grid",
            gap: "20px",
          })}
        >
          <section
            mix={css({
              padding: "24px",
              border: "1px solid #1e293b",
              borderRadius: "16px",
              background: "#111827",
            })}
          >
            <p
              mix={css({
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "12px",
                color: "#94a3b8",
              })}
            >
              Testing harness
            </p>
            <h1 mix={css({ margin: "8px 0 0", fontSize: "40px", lineHeight: 1.1 })}>
              {APP_DISPLAY_NAME}
            </h1>
            <p mix={css({ margin: "12px 0 0", maxWidth: "62ch", color: "#cbd5e1" })}>
              Open the debug console to inspect device state, call APIs, and watch live websocket
              events.
            </p>
          </section>

          <section
            mix={css({
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            })}
          >
            <Card
              href={routes.debug.href()}
              title="Debug console"
              body="Device list, API caller, state viewer, and event log."
            />
            <Card
              href={routes.schema.href()}
              title="Schema JSON"
              body="Inspect the generated schema payload the UI consumes."
            />
            <Card
              href={routes.auth.href()}
              title="Auth shell"
              body="Placeholder route for session work later."
            />
          </section>
        </main>
      </body>
    </html>
  );
}

function Card(handle: Handle<{ href: string; title: string; body: string }>) {
  return () => (
    <a
      href={handle.props.href}
      mix={css({
        padding: "18px",
        borderRadius: "14px",
        border: "1px solid #334155",
        background: "#0f172a",
        color: "inherit",
        textDecoration: "none",
        transition: "border-color 150ms ease, transform 150ms ease",
        "&:hover, &:focus-visible": {
          borderColor: "#38bdf8",
          transform: "translateY(-1px)",
          outline: "none",
        },
      })}
    >
      <h2 mix={css({ margin: 0, fontSize: "18px" })}>{handle.props.title}</h2>
      <p mix={css({ margin: "8px 0 0", color: "#94a3b8" })}>{handle.props.body}</p>
    </a>
  );
}
