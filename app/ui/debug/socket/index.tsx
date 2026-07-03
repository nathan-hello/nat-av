import { getRpc } from "@/state";
import type { Drivers } from "@av/client";
import type { Handle } from "remix/ui";
import { css, on } from "remix/ui";

function findNode(
  nodes: Drivers.DriverView[],
  name: string,
): Drivers.DriverView | undefined {
  for (const node of nodes) {
    if (node.name === name) return node;
    const found = findNode(node.deps, name);
    if (found) return found;
  }
  return undefined;
}

type DebugSocketPanelProps = {
  selectedDriverName: string | null;
  onSelectDriver(name: string): void;
};

export function DebugSocketPanel(handle: Handle<DebugSocketPanelProps>) {
  let draft = "";
  let encoding: "utf8" = "utf8";
  let sending = false;
  let sendError = "";

  let rpc = getRpc(handle);
  let debug = rpc.driver("debugger");

  async function sendSelectedSocket() {
    if (!handle.props.selectedDriverName || draft.length === 0 || sending) {
      return;
    }

    sending = true;
    sendError = "";
    await handle.update();

    if (encoding === "utf8") {
      draft = draft.replaceAll("\\n", "\n");
      draft = draft.replaceAll("\\r", "\r");
    }

    await debug.api.socket.write({
      name: handle.props.selectedDriverName,
      text: draft,
      encoding,
    });

    draft = "";
    sending = false;
    await handle.update();
  }

  return () => {
    const driverName = handle.props.selectedDriverName as any;
    const selected = driverName ? rpc.driver(driverName) : undefined;
    const messages = debug.state?.messages[driverName] ?? [];
    const node =
      driverName ? findNode(debug.state?.view ?? [], driverName) : undefined;

    return (
      <>
        <section mix={panelStyle}>
          <div mix={panelHeaderStyle}>
            <div>
              <h2 mix={panelTitleStyle}>
                {selected?.name ?? "Select a driver"}
              </h2>
              <p mix={panelSubtitleStyle}>
                {debug.state?.messages[driverName] ?
                  `trace: ${node?.socket?.traceName}`
                : "No socket selected yet."}
              </p>
            </div>
            {handle.props.selectedDriverName ?
              <button
                type="button"
                mix={[
                  secondaryButtonStyle,
                  on("click", () => {
                    debug.api.clear(driverName);
                    handle.props.onSelectDriver(driverName);
                  }),
                ]}
              >
                Clear
              </button>
            : null}
          </div>

          <div mix={messageListStyle}>
            {messages.length > 0 ?
              messages
                .filter((m) => {
                  if (m.direction === "rx") {
                    return false;
                  }
                  return true;
                })
                .map((message, index) => (
                  <article
                    key={`${message.time}:${message.direction}:${index}`}
                    mix={messageCardStyle(message.direction)}
                  >
                    <div mix={messageMetaRowStyle}>
                      <span mix={messageDirectionStyle(message.direction)}>
                        {message.direction === "rx-delimited" ?
                          "RX"
                        : message.direction === "rx" ?
                          "RX"
                        : "TX"}
                      </span>
                      <span>{message.time}</span>
                      <span>
                        {message.data.length ?? message.data.length} bytes
                      </span>
                    </div>
                    {message.data ?
                      <code mix={hexStyle}>
                        {new TextDecoder().decode(new Uint8Array(message.data))}
                      </code>
                    : null}
                  </article>
                ))
            : <p mix={emptyStyle}>
                {handle.props.selectedDriverName ?
                  "No socket traffic yet."
                : "Select a socket-capable driver."}
              </p>
            }
          </div>
        </section>

        <section mix={panelStyle}>
          <div mix={panelHeaderStyle}>
            <div>
              <h2 mix={panelTitleStyle}>Write</h2>
              <p mix={panelSubtitleStyle}>
                Send utf8 text directly to the underlying driver socket.
              </p>
            </div>
          </div>

          <div mix={composerStyle}>
            <label mix={fieldStyle}>
              <span>Encoding</span>
              <select
                value={encoding}
                mix={[
                  inputStyle,
                  on("change", (event) => {
                    encoding = event.currentTarget.value as "utf8";
                    handle.update();
                  }),
                ]}
              >
                <option value="utf8">utf8</option>
              </select>
            </label>

            <label mix={fieldStyle}>
              <span>Payload</span>
              <textarea
                value={draft}
                rows={8}
                placeholder="Type raw utf8 text to send over the socket"
                mix={[
                  textareaStyle,
                  on("input", (event) => {
                    draft = event.currentTarget.value;
                    handle.update();
                  }),
                ]}
              />
            </label>

            {sendError ?
              <p mix={errorStyle}>{sendError}</p>
            : null}

            <div mix={composerFooterStyle}>
              <span mix={hintStyle}>
                {handle.props.selectedDriverName ?
                  `Target: ${handle.props.selectedDriverName}`
                : "Pick a driver before sending."}
              </span>
              <button
                type="button"
                disabled={
                  !handle.props.selectedDriverName ||
                  draft.length === 0 ||
                  sending
                }
                mix={[
                  primaryButtonStyle,
                  on("click", () => {
                    void sendSelectedSocket();
                  }),
                ]}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </>
    );
  };
}

const panelStyle = css({
  background: "#020617",
  border: "1px solid #1e293b",
  borderRadius: "18px",
  padding: "18px",
  display: "grid",
  gap: "14px",
});
const panelHeaderStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "start",
  flexWrap: "wrap",
});
const panelTitleStyle = css({ margin: 0, fontSize: "18px" });
const panelSubtitleStyle = css({
  margin: "6px 0 0",
  color: "#94a3b8",
  fontSize: "13px",
});
const messageListStyle = css({
  display: "grid",
  gap: "10px",
  maxHeight: "58vh",
  overflow: "auto",
});
const messageCardStyle = (direction: "rx" | "tx" | "rx-delimited") =>
  css({
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "16px",
    border:
      "1px solid " +
      (direction === "rx" || direction === "rx-delimited" ?
        "#155e75"
      : "#713f12"),
    background:
      direction === "rx" || direction === "rx-delimited" ?
        "#082f49"
      : "#431407",
  });
const messageMetaRowStyle = css({
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
  fontSize: "12px",
  color: "#cbd5e1",
});
const messageDirectionStyle = (direction: "rx" | "tx" | "rx-delimited") =>
  css({
    padding: "3px 8px",
    borderRadius: "999px",
    background: direction === "rx" ? "#0e7490" : "#b45309",
    color: "#f8fafc",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
  });
const messageBodyStyle = css({
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "13px",
  lineHeight: 1.5,
});
const hexStyle = css({
  display: "block",
  color: "#cbd5e1",
  fontSize: "12px",
  wordBreak: "break-all",
});
const composerStyle = css({ display: "grid", gap: "14px" });
const fieldStyle = css({
  display: "grid",
  gap: "8px",
  color: "#cbd5e1",
  fontSize: "13px",
});
const inputStyle = css({
  width: "100%",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "10px 12px",
});
const textareaStyle = css({
  width: "100%",
  borderRadius: "16px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.5,
  resize: "vertical",
});
const composerFooterStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  flexWrap: "wrap",
});
const hintStyle = css({ color: "#94a3b8", fontSize: "12px" });
const primaryButtonStyle = css({
  borderRadius: "999px",
  border: "1px solid #0ea5e9",
  background: "#0284c7",
  color: "#f8fafc",
  padding: "10px 16px",
  fontWeight: "700",
});
const secondaryButtonStyle = css({
  borderRadius: "999px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#cbd5e1",
  padding: "8px 12px",
});
const errorStyle = css({ margin: 0, color: "#fca5a5", fontSize: "13px" });
const emptyStyle = css({ margin: 0, color: "#64748b" });
