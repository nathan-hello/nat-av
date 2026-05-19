import { css, type Handle } from "remix/ui";
import { getRpc } from "@/state";
import type { ClientRpc } from "@av/rpc/client";

export function HomePage(handle: Handle) {
  let rpc: ClientRpc = getRpc(handle);

  const asdf = rpc.device("video-wall").api.route(1, "", { offsetY: 0, offsetX: 0, resX: 0, resY: 0 });

  return () => {
    return (
      <main mix={shellStyle}>
        <header mix={headerStyle}>
          <div>
            <p mix={eyebrowStyle}>Control surface</p>
            <h1 mix={titleStyle}>Decoder Control</h1>
            <p mix={subtitleStyle}>
              Live router for the `video-wall` device. Route, move, template-switch, and wipe from
              one page.
            </p>
          </div>
          <div mix={statusPillsStyle}>
            <span mix={pillStyle(rpc.isOnline)}>
              {rpc.isOnline ? "RPC Connected" : "RPC Disconnected"}
            </span>
            <a href={"/debug"} mix={linkStyle}>
              Debug
            </a>
          </div>
        </header>
      </main>
    );
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
const titleStyle = css({ margin: "4px 0 0", fontSize: "32px", lineHeight: 1.1 });
const subtitleStyle = css({ margin: "10px 0 0", color: "#94a3b8", maxWidth: "72ch" });
const statusPillsStyle = css({
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
});
const linkStyle = css({ color: "#7dd3fc", textDecoration: "none" });
const errorBannerStyle = css({
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #7f1d1d",
  background: "#450a0a",
  color: "#fca5a5",
});
const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: "18px",
  alignItems: "start",
  "@media (max-width: 1100px)": { gridTemplateColumns: "1fr" },
});
const sidebarStyle = css({ display: "grid", gap: "14px" });
const contentStyle = css({ display: "grid", gap: "14px" });
const panelStyle = css({
  border: "1px solid #1e293b",
  borderRadius: "16px",
  background: "#0f172a",
  padding: "14px",
});
const panelTitleStyle = css({
  margin: 0,
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#94a3b8",
  marginBottom: "10px",
});
const fieldStyle = css({ display: "grid", gap: "6px" });
const fieldLabelStyle = css({ fontSize: "11px", color: "#94a3b8" });
const inputStyle = css({
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
});
const inlineGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
});
const actionRowStyle = css({ display: "flex", gap: "10px", flexWrap: "wrap" });
const primaryButtonStyle = css({
  padding: "10px 14px",
  borderRadius: "10px",
  border: 0,
  background: "#0ea5e9",
  color: "#fff",
  cursor: "pointer",
});
const secondaryButtonStyle = css({
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
  cursor: "pointer",
});
const dangerButtonStyle = css({
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid #7f1d1d",
  background: "#450a0a",
  color: "#fecaca",
  cursor: "pointer",
});
const templateListStyle = css({ display: "grid", gap: "8px" });
const templateButtonStyle = (active: boolean) =>
  css({
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  });
const sourcesStyle = css({ display: "grid", gap: "14px" });
const sourceWrapStyle = css({ display: "flex", flexWrap: "wrap", gap: "8px" });
const sourceStyle = (selected: boolean) =>
  css({
    padding: "10px 12px",
    borderRadius: "999px",
    border: "1px solid " + (selected ? "#38bdf8" : "#334155"),
    background: selected ? "#0f172a" : "#020617",
    color: selected ? "#e0f2fe" : "#cbd5e1",
    cursor: "grab",
  });
const stateStyle = css({
  margin: 0,
  fontSize: "12px",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#86efac",
});
const emptyStyle = css({
  padding: "18px",
  border: "1px dashed #334155",
  borderRadius: "14px",
  color: "#64748b",
});
const canvasShellStyle = css({ display: "grid", gap: "10px" });
const canvasMetaStyle = css({
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  fontSize: "12px",
  color: "#94a3b8",
});
const canvasStyle = css({
  position: "relative",
  border: "2px solid #334155",
  borderRadius: "16px",
  background: "#030712",
  overflow: "hidden",
});
const regionStyle = css({
  position: "absolute",
  border: "1px dashed #334155",
  background: "transparent",
  color: "#64748b",
  fontSize: "11px",
  cursor: "copy",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
const windowStyle = (active: boolean) =>
  css({
    position: "absolute",
    border: "1px solid " + (active ? "#38bdf8" : "#475569"),
    background: active ? "rgba(14, 165, 233, 0.15)" : "rgba(15, 23, 42, 0.85)",
    color: "#e2e8f0",
    fontSize: "11px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
const pillStyle = (connected: boolean) =>
  css({
    padding: "8px 12px",
    borderRadius: "999px",
    background: connected ? "#14532d" : "#450a0a",
    color: connected ? "#86efac" : "#fca5a5",
    border: "1px solid " + (connected ? "#166534" : "#7f1d1d"),
    fontSize: "12px",
  });
const inlineGrid = inlineGridStyle;
