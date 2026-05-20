import type { DebugDeviceNode } from "@av/rpc/debug/types";
import { css, on, type Handle } from "remix/ui";
import { getRpc } from "@/state";

export function DebugPage(handle: Handle) {
  const rpc = getRpc(handle);
  const debug = rpc.debug;

  let selectedDeviceName: string | null = null;
  let draft = "";
  let encoding: "utf8" = "utf8";
  let sending = false;
  let sendError = "";

  async function sendSelectedSocket() {
    if (!selectedDeviceName || draft.length === 0 || sending) {
      return;
    }

    sending = true;
    sendError = "";
    await handle.update();

    try {
      await debug.writeSocket(selectedDeviceName, draft, encoding);
      draft = "";
    } catch (error) {
      sendError = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
      await handle.update();
    }
  }

  function renderTreeNode(node: DebugDeviceNode, depth = 0) {
    const socket = node.socket;
    const selectable = !!socket?.canWrite && !!socket?.canReceive;
    const isSelected = selectedDeviceName === node.name;

    return (
      <div key={node.name}>
        <button
          type="button"
          mix={[
            treeButtonStyle,
            on("click", () => {
              if (!selectable) {
                return;
              }

              selectedDeviceName = node.name;
              sendError = "";
              handle.update();
            }),
          ]}
          style={{
            paddingLeft: `${12 + depth * 18}px`,
            borderColor: isSelected ? "#38bdf8" : "#1e293b",
            background: isSelected ? "#082f49" : selectable ? "#020617" : "#111827",
            color: selectable ? "#e2e8f0" : "#64748b",
            cursor: selectable ? "pointer" : "not-allowed",
          }}
        >
          <span>
            <strong>{node.name}</strong>
            <span mix={treeMetaStyle}>{node.driverName}</span>
          </span>
          <span mix={treeBadgeStyle(selectable)}>{selectable ? "socket" : "no socket"}</span>
        </button>
        {node.children.length > 0 ? node.children.map((child) => renderTreeNode(child, depth + 1)) : null}
      </div>
    );
  }

  return () => {
    const tree = debug.tree;
    const fallbackSelection = findFirstSocketDevice(tree);
    const selectedNode = selectedDeviceName ? debug.getDevice(selectedDeviceName) : undefined;
    const selectedSocketReady = !!selectedNode?.socket?.canWrite && !!selectedNode?.socket?.canReceive;

    if (!selectedSocketReady) {
      selectedDeviceName = fallbackSelection?.name ?? null;
    }

    const selected = selectedDeviceName ? debug.getDevice(selectedDeviceName) : undefined;
    const messages = selectedDeviceName ? [...debug.getSocketMessages(selectedDeviceName)].reverse() : [];
    const selectedName = selectedDeviceName;

    return (
      <main mix={shellStyle}>
        <header mix={headerStyle}>
          <div>
            <p mix={eyebrowStyle}>Debugger UI</p>
            <h1 mix={titleStyle}>Socket Console</h1>
            <p mix={subtitleStyle}>
              First pass: utf8 writes go through `RpcDebugClient` / `RpcDebugServer`, while socket
              rx/tx and telemetry logs stream over the dedicated debug websocket.
            </p>
          </div>
          <div mix={statusRowStyle}>
            <span mix={statusPillStyle(debug.isOnline)}>
              {debug.isOnline ? "Debug Connected" : "Debug Disconnected"}
            </span>
            <a href="/" mix={linkStyle}>
              Control Surface
            </a>
          </div>
        </header>

        <section mix={layoutStyle}>
          <aside mix={sidebarStyle}>
            <div mix={panelHeaderStyle}>
              <h2 mix={panelTitleStyle}>Devices</h2>
              <p mix={panelSubtitleStyle}>Only devices with `write()` and `on("receive")` are selectable.</p>
            </div>
            <div mix={treeStyle}>
              {tree.length > 0 ? tree.map((node) => renderTreeNode(node)) : <p mix={emptyStyle}>Waiting for device debug tree...</p>}
            </div>
          </aside>

          <section mix={consoleColumnStyle}>
            <section mix={panelStyle}>
              <div mix={panelHeaderStyle}>
                <div>
                  <h2 mix={panelTitleStyle}>{selected?.name ?? "Select a device"}</h2>
                  <p mix={panelSubtitleStyle}>
                    {selected?.socket ? `trace: ${selected.socket.traceName}` : "No socket selected yet."}
                  </p>
                </div>
                {selectedName ? (
                  <button
                    type="button"
                    mix={[
                      secondaryButtonStyle,
                      on("click", () => {
                        debug.clearSocketMessages(selectedName);
                        handle.update();
                      }),
                    ]}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div mix={messageListStyle}>
                {messages.length > 0 ? messages.map((message, index) => (
                  <article key={`${message.time}:${message.direction}:${index}`} mix={messageCardStyle(message.direction)}>
                    <div mix={messageMetaRowStyle}>
                      <span mix={messageDirectionStyle(message.direction)}>
                        {message.direction === "rx" ? "RX" : "TX"}
                      </span>
                      <span>{message.time}</span>
                      <span>{message.length ?? message.text.length} bytes</span>
                    </div>
                    <pre mix={messageBodyStyle}>{message.text || "<empty utf8 payload>"}</pre>
                    {message.hex ? <code mix={hexStyle}>{message.hex}</code> : null}
                  </article>
                )) : <p mix={emptyStyle}>{selectedDeviceName ? "No socket traffic yet." : "Select a socket-capable device."}</p>}
              </div>
            </section>

            <section mix={panelStyle}>
              <div mix={panelHeaderStyle}>
                <div>
                  <h2 mix={panelTitleStyle}>Write</h2>
                  <p mix={panelSubtitleStyle}>Send utf8 text directly to the underlying device socket.</p>
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

                {sendError ? <p mix={errorStyle}>{sendError}</p> : null}

                <div mix={composerFooterStyle}>
                  <span mix={hintStyle}>
                    {selectedDeviceName ? `Target: ${selectedDeviceName}` : "Pick a device before sending."}
                  </span>
                  <button
                    type="button"
                    disabled={!selectedDeviceName || draft.length === 0 || sending}
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
          </section>
        </section>
      </main>
    );
  };
}

function findFirstSocketDevice(nodes: DebugDeviceNode[]): DebugDeviceNode | undefined {
  for (const node of nodes) {
    if (node.socket?.canWrite && node.socket.canReceive) {
      return node;
    }

    const child = findFirstSocketDevice(node.children);
    if (child) {
      return child;
    }
  }

  return undefined;
}

const shellStyle = css({ padding: "24px", display: "grid", gap: "18px", color: "#e2e8f0" });
const headerStyle = css({ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" });
const eyebrowStyle = css({ margin: 0, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "11px", color: "#38bdf8" });
const titleStyle = css({ margin: "4px 0 0", fontSize: "32px", lineHeight: 1.05 });
const subtitleStyle = css({ margin: "10px 0 0", color: "#94a3b8", maxWidth: "78ch" });
const statusRowStyle = css({ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" });
const statusPillStyle = (connected: boolean) =>
  css({
    padding: "8px 12px",
    borderRadius: "999px",
    background: connected ? "#14532d" : "#450a0a",
    color: connected ? "#86efac" : "#fca5a5",
    border: "1px solid " + (connected ? "#166534" : "#7f1d1d"),
    fontSize: "12px",
  });
const linkStyle = css({ color: "#7dd3fc", textDecoration: "none" });
const layoutStyle = css({ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "stretch" });
const sidebarStyle = css({ flex: "1 1 320px", minWidth: "280px", display: "grid", gap: "12px" });
const consoleColumnStyle = css({ flex: "3 1 720px", minWidth: "320px", display: "grid", gap: "18px" });
const panelStyle = css({ background: "#020617", border: "1px solid #1e293b", borderRadius: "18px", padding: "18px", display: "grid", gap: "14px" });
const panelHeaderStyle = css({ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" });
const panelTitleStyle = css({ margin: 0, fontSize: "18px" });
const panelSubtitleStyle = css({ margin: "6px 0 0", color: "#94a3b8", fontSize: "13px" });
const treeStyle = css({ background: "#020617", border: "1px solid #1e293b", borderRadius: "18px", padding: "12px", display: "grid", gap: "8px" });
const treeButtonStyle = css({ width: "100%", display: "flex", justifyContent: "space-between", gap: "12px", border: "1px solid #1e293b", borderRadius: "14px", padding: "12px", textAlign: "left" });
const treeMetaStyle = css({ display: "block", marginTop: "4px", fontSize: "12px", color: "#94a3b8" });
const treeBadgeStyle = (active: boolean) => css({ alignSelf: "start", padding: "4px 8px", borderRadius: "999px", fontSize: "11px", background: active ? "#0f172a" : "#1f2937", color: active ? "#7dd3fc" : "#64748b", border: "1px solid " + (active ? "#0f766e" : "#334155") });
const messageListStyle = css({ display: "grid", gap: "10px", maxHeight: "58vh", overflow: "auto" });
const messageCardStyle = (direction: "rx" | "tx") =>
  css({
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid " + (direction === "rx" ? "#155e75" : "#713f12"),
    background: direction === "rx" ? "#082f49" : "#431407",
  });
const messageMetaRowStyle = css({ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px", color: "#cbd5e1" });
const messageDirectionStyle = (direction: "rx" | "tx") => css({ padding: "3px 8px", borderRadius: "999px", background: direction === "rx" ? "#0e7490" : "#b45309", color: "#f8fafc", fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em" });
const messageBodyStyle = css({ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px", lineHeight: 1.5 });
const hexStyle = css({ display: "block", color: "#cbd5e1", fontSize: "12px", wordBreak: "break-all" });
const composerStyle = css({ display: "grid", gap: "14px" });
const fieldStyle = css({ display: "grid", gap: "8px", color: "#cbd5e1", fontSize: "13px" });
const inputStyle = css({ width: "100%", borderRadius: "12px", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", padding: "10px 12px" });
const textareaStyle = css({ width: "100%", borderRadius: "16px", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", padding: "12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5, resize: "vertical" });
const composerFooterStyle = css({ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" });
const hintStyle = css({ color: "#94a3b8", fontSize: "12px" });
const primaryButtonStyle = css({ borderRadius: "999px", border: "1px solid #0ea5e9", background: "#0284c7", color: "#f8fafc", padding: "10px 16px", fontWeight: "700" });
const secondaryButtonStyle = css({ borderRadius: "999px", border: "1px solid #334155", background: "#0f172a", color: "#cbd5e1", padding: "8px 12px" });
const errorStyle = css({ margin: 0, color: "#fca5a5", fontSize: "13px" });
const emptyStyle = css({ margin: 0, color: "#64748b" });
