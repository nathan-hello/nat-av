import { getRpc } from "@/state";
import type { Rpc } from "@av/types";
import type { Handle } from "remix/ui";
import { css } from "remix/ui";
import { DebugSocketPanel } from "./socket";
import { DebugDeviceTree } from "./tree";

export function DebugPage(handle: Handle) {
  const rpc = getRpc(handle);
  const debug = rpc.debug;

  let selectedDeviceName: string | null = null;

  return () => {
    const tree = debug.tree;
    const fallbackSelection = findFirstSocketDevice(tree);
    const selectedNode =
      selectedDeviceName ? debug.getDevice(selectedDeviceName) : undefined;

    if (!selectedNode?.socket?.canWrite || !selectedNode?.socket?.canReceive) {
      selectedDeviceName = fallbackSelection?.name ?? null;
    }

    return (
      <main mix={shellStyle}>
        <header mix={headerStyle}>
          <p>Debugger UI</p>
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
              <h2>Devices</h2>
            </div>
            <DebugDeviceTree
              tree={tree}
              selectedDeviceName={selectedDeviceName}
              onSelect={(name) => {
                selectedDeviceName = name;
                handle.update();
              }}
            />
          </aside>

          <section mix={consoleColumnStyle}>
            <DebugSocketPanel
              debug={debug}
              selectedDeviceName={selectedDeviceName}
              onSelectDevice={(name) => {
                selectedDeviceName = name;
                handle.update();
              }}
            />
          </section>
        </section>
      </main>
    );
  };
}

function findFirstSocketDevice(
  nodes: Rpc.Debug.Node[],
): Rpc.Debug.Node | undefined {
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

const shellStyle = css({
  padding: "24px",
  display: "grid",
  gap: "18px",
  color: "#e2e8f0",
});
const headerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  color: "#000000",
});
const statusRowStyle = css({
  display: "flex",
  gap: "10px",
  alignItems: "center",
  flexWrap: "wrap",
});
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
const layoutStyle = css({
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  alignItems: "stretch",
});
const sidebarStyle = css({
  flex: "1 1 320px",
  minWidth: "280px",
  display: "grid",
  gap: "12px",
});
const consoleColumnStyle = css({
  flex: "3 1 720px",
  minWidth: "320px",
  display: "grid",
  gap: "18px",
});
const panelHeaderStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "start",
  flexWrap: "wrap",
});
