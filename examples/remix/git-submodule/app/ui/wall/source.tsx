import { css, on, type Handle } from "remix/ui";

export const SOURCE_ID_MIME = "application/x-natav-source-id";
export const SOURCE_NAME_MIME = "application/x-natav-source-name";

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
  let dragging = false;

  return () => (
    <button
      type="button"
      draggable
      aria-pressed={handle.props.selected ? true : undefined}
      mix={[
        sourceStyle,
        on("click", () => {
          handle.props.onSelect?.({
            id: handle.props.id,
            name: handle.props.name,
          });
        }),
        on("dragstart", (event) => {
          dragging = true;
          event.dataTransfer?.setData(SOURCE_ID_MIME, handle.props.id);
          event.dataTransfer?.setData(SOURCE_NAME_MIME, handle.props.name);
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "copy";
          }
          handle.update();
        }),
        on("dragend", () => {
          dragging = false;
          handle.update();
        }),
      ]}
      style={{
        background: handle.props.selected ? "#000" : "#fff",
        color: handle.props.selected ? "#fff" : "#000",
        opacity: dragging ? "0.45" : undefined,
      }}
    >
      {handle.props.name}
    </button>
  );
}

const sourceStyle = css({
  appearance: "none",
  border: "1px solid #c0c0c0",
  borderRadius: "999px",
  cursor: "grab",
  font: "inherit",
  padding: "10px 14px",
  textAlign: "left",
  userSelect: "none",
  whiteSpace: "nowrap",
});
