import { css, on, type Handle } from "remix/ui";
import type { LogicalWindow } from "@av/drivers/decoder/display";
import type {
  GridTemplate,
  RectangularRegion,
} from "@av/drivers/decoder/display/templates/builder";
import { SOURCE_ID_MIME, SOURCE_NAME_MIME } from "@/ui/av/wall/source";

type CanvasGlobal = {
  resX: number;
  resY: number;
  offsetX: number;
  offsetY: number;
};

type InteractionMode = "free" | "snap";

type DroppedSource = {
  id: string;
  name: string;
};

type DragState = {
  windowId: number;
  preview: CanvasGlobal;
};

interface DecoderProps {
  canvas: { width: number; height: number };
  windows: LogicalWindow[];
  template: GridTemplate;
  encoders?: { name: string; uri: string }[];
  scale?: number;
  mode: InteractionMode;
  movePending?: boolean;
  routePending?: boolean;
  selectedWindowId?: number | null;
  onRegionSelect?: (region: RectangularRegion, global: CanvasGlobal) => void;
  onWindowSelect?: (window: LogicalWindow) => void;
  onWindowMove?: (window: LogicalWindow, global: CanvasGlobal) => void;
  onWindowMoveEnd?: (window: LogicalWindow, global: CanvasGlobal) => void;
  onSourceDropToRegion?: (
    region: RectangularRegion,
    global: CanvasGlobal,
    source: DroppedSource,
  ) => void;
  onSourceDropToWindow?: (window: LogicalWindow, source: DroppedSource) => void;
}

export function Decoder(handle: Handle<DecoderProps>) {
  let dragState: DragState | null = null;
  let snapTarget: { type: "region" | "window"; id: number } | null = null;
  let suppressClickWindowId: number | null = null;

  function setSnapTarget(next: { type: "region" | "window"; id: number } | null) {
    if (snapTarget?.type === next?.type && snapTarget?.id === next?.id) {
      return;
    }

    snapTarget = next;
    handle.update();
  }

  function beginWindowDrag(event: PointerEvent, twindow: LogicalWindow, scale: number) {
    if (handle.props.mode !== "free" || event.button !== 0) {
      return;
    }

    event.preventDefault();
    handle.props.onWindowSelect?.(twindow);

    const startX = event.clientX;
    const startY = event.clientY;
    const startGlobal = twindow.global;

    function getPreview(clientX: number, clientY: number) {
      const deltaX = (clientX - startX) / scale;
      const deltaY = (clientY - startY) / scale;
      const nextOffsetX = clamp(
        Math.round(startGlobal.offsetX + deltaX),
        0,
        handle.props.canvas.width - startGlobal.resX,
      );
      const nextCssTop = clamp(
        Math.round(
          decoderYToCssTop(startGlobal.offsetY, startGlobal.resY, handle.props.canvas.height) +
            deltaY,
        ),
        0,
        handle.props.canvas.height - startGlobal.resY,
      );

      return {
        resX: startGlobal.resX,
        resY: startGlobal.resY,
        offsetX: nextOffsetX,
        offsetY: cssTopToDecoderY(nextCssTop, startGlobal.resY, handle.props.canvas.height),
      } satisfies CanvasGlobal;
    }

    dragState = {
      windowId: twindow.id,
      preview: { ...startGlobal },
    };

    handle.update();

    const move = (moveEvent: PointerEvent) => {
      dragState = {
        windowId: twindow.id,
        preview: getPreview(moveEvent.clientX, moveEvent.clientY),
      };

      handle.props.onWindowMove?.(twindow, dragState.preview);
      handle.update();
    };

    const finish = (finishEvent: PointerEvent) => {
      const finalPreview = getPreview(finishEvent.clientX, finishEvent.clientY);
      dragState = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);

      if (finishEvent.type === "pointerup") {
        suppressClickWindowId = twindow.id;
        handle.props.onWindowMoveEnd?.(twindow, finalPreview);
      }

      handle.update();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return () => {
    const scale = handle.props.scale ?? 0.6;
    const gridCols = getTemplateGridCols(handle.props.template);
    const gridRows = getTemplateGridRows(handle.props.template);
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
          const global = getRegionGlobal(
            region,
            handle.props.canvas,
            gridUnitWidth,
            gridUnitHeight,
          );

          return (
            <div
              key={`region-${region.id}`}
              mix={[
                regionStyle,
                on("click", () => {
                  if (handle.props.routePending) {
                    return;
                  }

                  handle.props.onRegionSelect?.(region, global);
                }),
                on("dragover", (event) => {
                  if (handle.props.mode !== "snap" || !readDraggedSource(event.dataTransfer)) {
                    return;
                  }

                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "copy";
                  }
                  setSnapTarget({ type: "region", id: region.id });
                }),
                on("dragleave", () => {
                  if (snapTarget?.type === "region" && snapTarget.id === region.id) {
                    setSnapTarget(null);
                  }
                }),
                on("drop", (event) => {
                  event.preventDefault();
                  const source = readDraggedSource(event.dataTransfer);
                  setSnapTarget(null);
                  if (!source || handle.props.mode !== "snap" || handle.props.routePending) {
                    return;
                  }

                  handle.props.onSourceDropToRegion?.(region, global, source);
                }),
              ]}
              style={{
                left: `${global.offsetX * scale}px`,
                top: `${decoderYToCssTop(global.offsetY, global.resY, handle.props.canvas.height) * scale}px`,
                width: `${global.resX * scale}px`,
                height: `${global.resY * scale}px`,
                borderColor:
                  snapTarget?.type === "region" && snapTarget.id === region.id ? "#000" : undefined,
                background:
                  snapTarget?.type === "region" && snapTarget.id === region.id ?
                    "rgba(0, 0, 0, 0.06)"
                  : undefined,
              }}
            >
              {region.id}
            </div>
          );
        })}

        {handle.props.windows.map((twindow) => {
          const preview = dragState?.windowId === twindow.id ? dragState.preview : twindow.global;
          const sourceName =
            handle.props.encoders?.find((encoder) => encoder.uri === twindow.routes[0]?.uri)
              ?.name ??
            twindow.routes[0]?.uri ??
            `Window ${twindow.id}`;

          return (
            <button
              key={`window-${twindow.id}`}
              type="button"
              mix={[
                windowStyle,
                on("click", () => {
                  if (suppressClickWindowId === twindow.id) {
                    suppressClickWindowId = null;
                    return;
                  }

                  handle.props.onWindowSelect?.(twindow);
                }),
                on("pointerdown", (event) => {
                  beginWindowDrag(event, twindow, scale);
                }),
                on("dragover", (event) => {
                  if (handle.props.mode !== "snap" || !readDraggedSource(event.dataTransfer)) {
                    return;
                  }

                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "copy";
                  }
                  setSnapTarget({ type: "window", id: twindow.id });
                }),
                on("dragleave", () => {
                  if (snapTarget?.type === "window" && snapTarget.id === twindow.id) {
                    setSnapTarget(null);
                  }
                }),
                on("drop", (event) => {
                  event.preventDefault();
                  const source = readDraggedSource(event.dataTransfer);
                  setSnapTarget(null);
                  if (!source || handle.props.mode !== "snap" || handle.props.routePending) {
                    return;
                  }

                  handle.props.onSourceDropToWindow?.(twindow, source);
                }),
              ]}
              style={{
                left: `${preview.offsetX * scale}px`,
                top: `${decoderYToCssTop(preview.offsetY, preview.resY, handle.props.canvas.height) * scale}px`,
                width: `${preview.resX * scale}px`,
                height: `${preview.resY * scale}px`,
                borderColor:
                  (
                    dragState?.windowId === twindow.id ||
                    handle.props.selectedWindowId === twindow.id ||
                    (snapTarget?.type === "window" && snapTarget.id === twindow.id)
                  ) ?
                    "#000"
                  : undefined,
                background:
                  dragState?.windowId === twindow.id ? "rgba(0, 0, 0, 0.08)"
                  : snapTarget?.type === "window" && snapTarget.id === twindow.id ?
                    "rgba(0, 0, 0, 0.05)"
                  : undefined,
                cursor: handle.props.mode === "free" ? "grab" : "pointer",
              }}
            >
              <span mix={windowLabelStyle}>{sourceName}</span>
            </button>
          );
        })}
      </div>
    );
  };
}

function getRegionGlobal(
  region: RectangularRegion,
  canvas: { width: number; height: number },
  gridUnitWidth: number,
  gridUnitHeight: number,
): CanvasGlobal {
  return {
    resX: region.width * gridUnitWidth,
    resY: region.height * gridUnitHeight,
    offsetX: region.col * gridUnitWidth,
    offsetY: canvas.height - region.row * gridUnitHeight - region.height * gridUnitHeight,
  };
}

function getTemplateGridCols(template: GridTemplate) {
  return template.dimensions.cols;
}

function getTemplateGridRows(template: GridTemplate) {
  return template.dimensions.rows;
}

function readDraggedSource(dataTransfer: DataTransfer | null): DroppedSource | null {
  const id = dataTransfer?.getData(SOURCE_ID_MIME);
  if (!id) {
    return null;
  }

  return {
    id,
    name: dataTransfer?.getData(SOURCE_NAME_MIME) || id,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function decoderYToCssTop(decoderY: number, windowHeight: number, canvasHeight: number) {
  return canvasHeight - decoderY - windowHeight;
}

function cssTopToDecoderY(cssTop: number, windowHeight: number, canvasHeight: number) {
  return canvasHeight - cssTop - windowHeight;
}

const canvasStyle = css({
  position: "relative",
  background: "#fff",
  border: "1px solid #cfcfcf",
  minWidth: "fit-content",
  userSelect: "none",
});

const regionStyle = css({
  position: "absolute",
  alignItems: "center",
  background: "transparent",
  border: "1px dashed #c0c0c0",
  color: "#666",
  display: "flex",
  fontSize: "12px",
  justifyContent: "center",
  pointerEvents: "auto",
});

const windowStyle = css({
  position: "absolute",
  alignItems: "center",
  appearance: "none",
  background: "#fff",
  border: "1px solid #888",
  color: "#000",
  display: "flex",
  font: "inherit",
  justifyContent: "center",
  overflow: "hidden",
  padding: "6px",
  textAlign: "center",
});

const windowLabelStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
