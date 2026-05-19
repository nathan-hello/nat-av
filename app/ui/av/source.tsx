import { css, on, type Handle } from "remix/ui";

export type SourceSelectDetail = {
  id: string;
  name: string;
};

interface SourceProps {
  id: string;
  name: string;
  selected?: boolean;
  onSelect?: (detail: SourceSelectDetail) => void;
}

export function Source(handle: Handle<SourceProps>) {
  return () => (
    <button
      type="button"
      aria-pressed={handle.props.selected ? true : undefined}
      mix={[
        sourceStyle,
        on("click", () => {
          handle.props.onSelect?.({ id: handle.props.id, name: handle.props.name });
        }),
      ]}
      style={{
        background: handle.props.selected ? "#1d4ed8" : undefined,
        borderColor: handle.props.selected ? "#60a5fa" : undefined,
        color: handle.props.selected ? "#eff6ff" : undefined,
      }}
    >
      {handle.props.name}
    </button>
  );
}

const sourceStyle = css({
  appearance: "none",
  border: "1px solid #334155",
  borderRadius: "10px",
  background: "#0f172a",
  color: "#e2e8f0",
  cursor: "pointer",
  font: "inherit",
  padding: "10px 12px",
  textAlign: "left",
});
