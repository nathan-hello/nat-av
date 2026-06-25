import { getRpc } from "@/state";
import { type Drivers, RpcDriver, Rpc } from "@av/client";
import type { natav } from "@server/index";
import type { Handle } from "remix/ui";
import { css } from "remix/ui";
import { DebugSocketPanel } from "./socket";
import { DebugDriverTree } from "./tree";

export function DebugPage(handle: Handle) {
  const rpc = getRpc(handle);
  const debug = rpc.driver("debugger");

  let selectedDriverName: string | null = null;
  let selectedNode: Rpc.Client.DriverHandle | null = null;

  return () => {
    const tree = debug.api.tree();
    const fallbackSelection = findFirstSocketDriver(tree);
    if (selectedDriverName) {
      selectedNode = rpc.driver(
        selectedDriverName as Drivers.Names<natav["configs"]>,
      );
    }

    const dnode = tree.find((t) => t.name === selectedNode?.name);

    if (!dnode?.socket?.canWrite || !dnode?.socket?.canReceive) {
      selectedDriverName = fallbackSelection?.name ?? null;
    }

    return (
      <main mix={shellStyle}>
        <header mix={headerStyle}>
          <p>Debugger UI</p>
          <div mix={statusRowStyle}>
            <a href="/" mix={linkStyle}>
              Control Surface
            </a>
          </div>
        </header>

        <section mix={layoutStyle}>
          <aside mix={sidebarStyle}>
            <div mix={panelHeaderStyle}>
              <h2>Drivers</h2>
            </div>
            <DebugDriverTree
              tree={tree}
              selectedDriverName={selectedDriverName}
              onSelect={(name) => {
                selectedDriverName = name;
                handle.update();
              }}
            />
          </aside>

          <section mix={consoleColumnStyle}>
            <DebugSocketPanel
              selectedDriverName={selectedDriverName}
              onSelectDriver={(name) => {
                selectedDriverName = name;
                handle.update();
              }}
            />
          </section>
        </section>
      </main>
    );
  };
}

function findFirstSocketDriver(
  nodes: Drivers.DriverView[],
): Drivers.DriverView | undefined {
  for (const node of nodes) {
    if (node.socket?.canWrite && node.socket.canReceive) {
      return node;
    }

    const child = findFirstSocketDriver(node.deps);
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
