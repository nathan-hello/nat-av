import { css, on, type Handle } from "remix/ui";
import type { LogicalWindow } from "@av/drivers/decoder/impl/display";
import type {
  GridTemplate,
  RectangularRegion,
} from "@av/drivers/decoder/impl/templates/builder";

const GRID_COLS_PER_MONITOR = 2;
const GRID_ROWS_PER_MONITOR = 2;

function decoderYToCssTop(decoderY: number, windowHeight: number, canvasHeight: number) {
  return canvasHeight - decoderY - windowHeight;
}

interface DecoderProps {
  canvas: { width: number; height: number };
  windows: LogicalWindow[];
  template: GridTemplate;
  encoders?: { name: string; uri: string }[];
  scale?: number;
  selectedWindowId?: number | null;
  onRegionSelect?: (
    region: RectangularRegion,
    global: { resX: number; resY: number; offsetX: number; offsetY: number },
  ) => void;
  onWindowSelect?: (window: LogicalWindow) => void;
}

export function Decoder(handle: Handle<DecoderProps>) {
  return () => {
    const scale = handle.props.scale ?? 0.2;
    const gridCols = handle.props.template.dimensions.cols * GRID_COLS_PER_MONITOR;
    const gridRows = handle.props.template.dimensions.rows * GRID_ROWS_PER_MONITOR;
    const gridUnitWidth = handle.props.canvas.width / gridCols;
    const gridUnitHeight = handle.props.canvas.height / gridRows;

    return (
      <div
        mix={canvasStyle}
        style={{
          width: `${handle.props.canvas.width * scale}px`,
          height: `${handle.props.canvas.height * scale}px`,
        }}
      >
        {handle.props.template.regions.map((region) => {
          const global = {
            resX: region.width * gridUnitWidth,
            resY: region.height * gridUnitHeight,
            offsetX: region.col * gridUnitWidth,
            offsetY:
              handle.props.canvas.height -
              region.row * gridUnitHeight -
              region.height * gridUnitHeight,
          };

          return (
            <button
              key={`region-${region.id}`}
              type="button"
              mix={[
                regionStyle,
                on("click", () => {
                  handle.props.onRegionSelect?.(region, global);
                }),
              ]}
              style={{
                left: `${global.offsetX * scale}px`,
                top: `${region.row * gridUnitHeight * scale}px`,
                width: `${global.resX * scale}px`,
                height: `${global.resY * scale}px`,
                zIndex: String(region.zIndex ?? 0),
              }}
            >
              Region {region.id}
            </button>
          );
        })}
        {handle.props.windows.map((window) => {
          const sourceName =
            handle.props.encoders?.find((encoder) => encoder.uri === window.routes[0]?.uri)?.name ??
            window.routes[0]?.uri ??
            `Window ${window.id}`;

          return (
            <button
              key={`window-${window.id}`}
              type="button"
              mix={[
                windowStyle,
                on("click", () => {
                  handle.props.onWindowSelect?.(window);
                }),
              ]}
              style={{
                left: `${window.global.offsetX * scale}px`,
                top: `${decoderYToCssTop(window.global.offsetY, window.global.resY, handle.props.canvas.height) * scale}px`,
                width: `${window.global.resX * scale}px`,
                height: `${window.global.resY * scale}px`,
                borderColor:
                  handle.props.selectedWindowId === window.id ? "#38bdf8" : undefined,
                background:
                  handle.props.selectedWindowId === window.id ? "rgba(14, 165, 233, 0.2)" : undefined,
              }}
            >
              {sourceName}
            </button>
          );
        })}
      </div>
    );
  };
}

const canvasStyle = css({
  position: "relative",
  overflow: "hidden",
  border: "1px solid #334155",
  borderRadius: "12px",
  background: "#020617",
});

const regionStyle = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #475569",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
  font: "inherit",
  fontSize: "11px",
  padding: 0,
});

const windowStyle = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #64748b",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#e2e8f0",
  cursor: "pointer",
  font: "inherit",
  fontSize: "11px",
  overflow: "hidden",
  padding: "4px",
  textAlign: "center",
});
