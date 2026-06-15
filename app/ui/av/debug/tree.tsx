import type { Drivers } from "@av/types";
import { css, on, type Handle } from "remix/ui";

type DebugDeviceTreeProps = {
  tree: Drivers.DriverView[];
  selectedDeviceName: string | null;
  onSelect(name: string): void;
};

export function DebugDeviceTree(handle: Handle<DebugDeviceTreeProps>) {
  return () => (
    <div mix={treeStyle}>
      {handle.props.tree.length > 0 ?
        handle.props.tree.map((node) => renderTreeNode(node, handle))
      : <p mix={emptyStyle}>Waiting for device debug tree...</p>}
    </div>
  );
}

function renderTreeNode(
  node: Drivers.DriverView,
  handle: Handle<DebugDeviceTreeProps>,
  depth = 0,
) {
  const socket = node.socket;
  const selectable = !!socket?.canWrite && !!socket?.canReceive;
  const isSelected = handle.props.selectedDeviceName === node.name;

  return (
    <div key={node.name}>
      <button
        type="button"
        mix={[
          treeButtonStyle,
          on("click", () => {
            if (!selectable) return;
            handle.props.onSelect(node.name);
          }),
        ]}
        style={{
          paddingLeft: `${12 + depth * 18}px`,
          borderColor: isSelected ? "#38bdf8" : "#1e293b",
          background:
            isSelected ? "#082f49"
            : selectable ? "#020617"
            : "#111827",
          color: selectable ? "#e2e8f0" : "#64748b",
          cursor: selectable ? "pointer" : "not-allowed",
        }}
      >
        <span>
          <strong>{node.name}</strong>
          <span mix={treeMetaStyle}>{node.driverName}</span>
        </span>
        <span mix={treeBadgeStyle(selectable)}>
          {selectable ? "socket" : "no socket"}
        </span>
      </button>
      {node.children.length > 0 ?
        node.children.map((child) => renderTreeNode(child, handle, depth + 1))
      : null}
    </div>
  );
}

const treeStyle = css({
  background: "#020617",
  border: "1px solid #1e293b",
  borderRadius: "18px",
  padding: "12px",
  display: "grid",
  gap: "8px",
});
const treeButtonStyle = css({
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  border: "1px solid #1e293b",
  borderRadius: "14px",
  padding: "12px",
  textAlign: "left",
});
const treeMetaStyle = css({
  display: "block",
  marginTop: "4px",
  fontSize: "12px",
  color: "#94a3b8",
});
const treeBadgeStyle = (active: boolean) =>
  css({
    alignSelf: "start",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    background: active ? "#0f172a" : "#1f2937",
    color: active ? "#7dd3fc" : "#64748b",
    border: "1px solid " + (active ? "#0f766e" : "#334155"),
  });
const emptyStyle = css({ margin: 0, color: "#64748b" });
