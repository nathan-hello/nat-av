import type { ApiSurfaceSchema, MethodSchema } from "@av/schema/types";
import { css, on, type Handle } from "remix/ui";
import { getRpc } from "@/state";

type Tab = "state" | "api" | "events";

export function DebugPage(handle: Handle) {
  const rpc = getRpc(handle);
  let tab: Tab = "state";

  return () => {
    let schema = rpc.schema;
    if (!schema) {
      return <div mix={emptyStyle}>Waiting for schema</div>;
    }

    let state = rpc.system.state;

    return (
      <div mix={shellStyle}>
        <main mix={mainStyle}>
          <header mix={rowStyle}>
            <div>
              <h1 mix={titleStyle}>Natav debug console</h1>
              <p mix={mutedStyle}>{rpc.isOnline ? "websocket connected" : "websocket off"}</p>
            </div>
            <div mix={rowStyle}>
              <a href={"/"}>Home</a>
            </div>
          </header>

          <div mix={tabsStyle}>
            {(["state", "api"] as Exclude<Tab, "events">[]).map((next) => (
              <button
                key={next}
                type="button"
                mix={[
                  tabButtonStyle(tab === next),
                  on("click", () => {
                    tab = next;
                    handle.update();
                  }),
                ]}
              >
                {next}
              </button>
            ))}
          </div>
          {tab === "state" ?
            <pre mix={boxStyle}>{JSON.stringify(state, null, 2)}</pre>
          : null}
          {tab === "api" ?
            <ApiTab schema={schema} />
          : null}
        </main>
      </div>
    );
  };

  function ApiTab(handle: Handle<{ schema: ApiSurfaceSchema }>) {
    return () => {
      let methods = Object.entries(handle.props.schema.methods);
      if (!methods.length) return <div mix={emptyStyle}>No API methods</div>;

      return (
        <div mix={stackStyle}>
          {methods.map(([name, method]) => (
            <Method key={name} name={name} method={method} />
          ))}
        </div>
      );
    };
  }

  function Method(
    handle: Handle<{
      name: string;
      method: MethodSchema;
    }>,
  ) {
    let argsText = "[]";
    let result: string | null = null;

    return () => (
      <section mix={cardStyle}>
        <div mix={rowStyle}>
          <strong>{handle.props.name}</strong>
          <span>{handle.props.method.params.map((p) => p.name).join(", ") || "no params"}</span>
        </div>
        <textarea
          mix={[
            inputStyle,
            on("change", (event) => {
              argsText = (event.currentTarget as HTMLTextAreaElement).value;
            }),
          ]}
          rows={3}
          value={argsText}
        />
        <button
          type="button"
          mix={[
            buttonStyle,
            on("click", async () => {
              result = JSON.stringify(JSON.parse(argsText || "[]"), null, 2);
              handle.update();
            }),
          ]}
        >
          Call
        </button>
        {result ?
          <pre mix={boxStyle}>{result}</pre>
        : null}
      </section>
    );
  }
}

const bodyStyle = css({
  margin: 0,
  minHeight: "100vh",
  background: "#020617",
  color: "#e2e8f0",
  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
});
const shellStyle = css({
  display: "grid",
  gridTemplateColumns: "240px 1fr",
  minHeight: "100vh",
  "@media (max-width: 800px)": { gridTemplateColumns: "1fr" },
});
const sidebarStyle = css({
  padding: "12px",
  borderRight: "1px solid #1e293b",
  display: "grid",
  gap: "8px",
});
const mainStyle = css({ padding: "12px", display: "grid", gap: "12px" });
const titleStyle = css({ margin: 0, fontSize: "24px" });
const mutedStyle = css({ margin: 0, color: "#94a3b8" });
const rowStyle = css({
  display: "flex",
  gap: "8px",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
});
const tabsStyle = css({ display: "flex", gap: "8px" });
const stackStyle = css({ display: "grid", gap: "8px" });
const cardStyle = css({
  padding: "10px",
  border: "1px solid #334155",
  borderRadius: "10px",
  display: "grid",
  gap: "8px",
  background: "#0f172a",
});
const buttonStyle = css({
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "inherit",
  cursor: "pointer",
});
const inputStyle = css({
  width: "100%",
  padding: "8px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
  fontFamily: "inherit",
});
const boxStyle = css({
  margin: 0,
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#020617",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: "12px",
});
const emptyStyle = css({
  padding: "12px",
  border: "1px dashed #334155",
  borderRadius: "10px",
  color: "#64748b",
});
const tabButtonStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    cursor: "pointer",
  });
const deviceButtonStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
  });
