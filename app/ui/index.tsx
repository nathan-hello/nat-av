import { getRpc } from "@/state";
import { DantePage } from "@/ui/dante";
import { DebugPage } from "@/ui/debug";
import { PaintPage } from "@/ui/paint";
import { Wall } from "@/ui/wall";
import { css, on, type Handle } from "remix/ui";

export function HomePage(handle: Handle) {
  let rpc = getRpc(handle);
  let sys = rpc.driver("system");

  return () => {
    return (
      <main mix={shellStyle}>
        <header mix={headerStyle}>
          <div>
            <p mix={eyebrowStyle}>Control surface</p>
            <h1 mix={titleStyle}>Decoder Control</h1>
            <p mix={subtitleStyle}>
              Live router for the `video-wall` driver. Route, move,
              template-switch, and wipe from one page.
            </p>
          </div>
          <div mix={statusPillsStyle}>
            <span mix={pillStyle(rpc.isOnline)}>
              {rpc.isOnline ? "RPC Connected" : "RPC Disconnected"}
            </span>
            <button
              mix={[
                linkStyle,
                on("click", () => {
                  sys.api.route("debug");
                }),
              ]}
            >
              Debug
            </button>
            <button
              mix={[
                linkStyle,
                on("click", () => {
                  sys.api.route("dante");
                }),
              ]}
            >
              Dante
            </button>
            <button
              mix={[
                linkStyle,
                on("click", () => {
                  sys.api.route("paint");
                }),
              ]}
            >
              Paint
            </button>
            <button
              mix={[
                linkStyle,
                on("click", () => {
                  sys.api.route("wall");
                }),
              ]}
            >
              Wall
            </button>
          </div>
          <SystemRoute />
        </header>
      </main>
    );
  };
}

function SystemRoute(handle: Handle) {
  let rpc = getRpc(handle, "system");

  return () => {
    switch (rpc.state.ui.page) {
      case "off":
        return null;
      case "wall":
        return <Wall driverName="video-wall" />;
      case "debug":
        return <DebugPage />;
      case "paint":
        return <PaintPage />;
      case "dante":
        return <DantePage />;
    }
  };
}

const shellStyle = css({ padding: "24px", display: "grid", gap: "18px" });
const headerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "start",
});
const eyebrowStyle = css({
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#64748b",
  fontSize: "11px",
});
const titleStyle = css({
  margin: "4px 0 0",
  fontSize: "32px",
  lineHeight: 1.1,
});
const subtitleStyle = css({
  margin: "10px 0 0",
  color: "#94a3b8",
  maxWidth: "72ch",
});
const statusPillsStyle = css({
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
});
const linkStyle = css({ color: "#7dd3fc", textDecoration: "none" });
const pillStyle = (connected: boolean) =>
  css({
    padding: "8px 12px",
    borderRadius: "999px",
    background: connected ? "#14532d" : "#450a0a",
    color: connected ? "#86efac" : "#fca5a5",
    border: "1px solid " + (connected ? "#166534" : "#7f1d1d"),
    fontSize: "12px",
  });
