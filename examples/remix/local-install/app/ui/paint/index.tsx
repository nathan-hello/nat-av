import { getRpc } from "@/state";
import {
  clientEntry,
  css,
  on,
  type Handle,
  type SerializableProps,
} from "remix/ui";

const RECORD_INTERVAL_MS = 100;
const COLORS = ["#000000", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
const SIZES = [2, 4, 8, 16, 32];

interface PaintPageProps extends SerializableProps {}

export const PaintPage = clientEntry(
  "/assets/app/ui/paint/index.tsx#PaintPage",
  function PaintPage(handle: Handle<PaintPageProps>) {
    const rpc = getRpc(handle, "paint");
    const paints = rpc.state.paints;
    // TSAS: paints is keyed by the constructor's `as const` names; pick the first declared paint as default.
    const paintNames = Object.keys(paints) as (keyof typeof paints)[];
    let selectedName: keyof typeof paints = paintNames[0]!;

    let color = COLORS[0]!;
    let size = SIZES[1]!;
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let recording = false;
    let recordTimer: ReturnType<typeof setInterval> | null = null;

    function ctx(): CanvasRenderingContext2D | null {
      const canvas = document.getElementById(
        "paint-canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) return null;
      return canvas.getContext("2d");
    }

    function commitFrame() {
      const canvas = document.getElementById(
        "paint-canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");
      void rpc.api.saveFrame({ name: selectedName, dataUrl });
    }

    return () => {
      const paintState = rpc.state.paints[selectedName];
      const width = paintState?.width ?? 1920;
      const height = paintState?.height ?? 1080;
      const saveCount = paintState?.saveCount ?? 0;

      handle.queueTask(() => {
        const canvas = document.getElementById(
          "paint-canvas",
        ) as HTMLCanvasElement | null;
        if (!canvas) return;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      });

      return (
        <main mix={shellStyle}>
          <header mix={headerStyle}>
            <div mix={toolbarStyle}>
              <label mix={fieldStyle}>
                <span>Paint</span>
                <select
                  value={String(selectedName)}
                  mix={[
                    selectStyle,
                    on("change", (event) => {
                      const target = event.target as HTMLSelectElement;
                      const next = target.value as keyof typeof paints;
                      if (next in paints) {
                        selectedName = next;
                        handle.update();
                      }
                    }),
                  ]}
                >
                  {paintNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <div mix={fieldStyle}>
                <span>Color</span>
                <div mix={colorRowStyle}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      mix={[
                        swatchStyle,
                        css({ background: c }),
                        c === color ? activeSwatchStyle : null,
                        on("click", () => {
                          color = c;
                          handle.update();
                        }),
                      ]}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>

              <div mix={fieldStyle}>
                <span>Size</span>
                <div mix={sizeRowStyle}>
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      mix={[
                        sizeBtnStyle,
                        s === size ? activeSizeStyle : null,
                        on("click", () => {
                          size = s;
                          handle.update();
                        }),
                      ]}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div mix={actionsStyle}>
              <button
                type="button"
                mix={[
                  btnStyle,
                  on("click", () => {
                    const c = ctx();
                    if (!c) return;
                    c.clearRect(0, 0, width, height);
                  }),
                ]}
              >
                Clear canvas
              </button>
              <button
                type="button"
                mix={[
                  btnStyle,
                  on("click", () => {
                    void rpc.api.clear({ name: selectedName });
                  }),
                ]}
              >
                Reset frames
              </button>
              <button
                type="button"
                mix={[
                  commitBtnStyle,
                  on("click", () => {
                    commitFrame();
                  }),
                ]}
              >
                Save frame
              </button>
              <button
                type="button"
                mix={[
                  btnStyle,
                  recording ? activeRecordStyle : null,
                  on("click", () => {
                    recording = !recording;
                    if (recording) {
                      commitFrame();
                      recordTimer = setInterval(commitFrame, RECORD_INTERVAL_MS);
                    } else if (recordTimer) {
                      clearInterval(recordTimer);
                      recordTimer = null;
                    }
                    handle.update();
                  }),
                ]}
              >
                {recording ? "Stop recording" : "Record"}
              </button>
            </div>
          </header>

          <section mix={canvasWrapStyle}>
            <canvas
              id="paint-canvas"
              mix={[
                canvasStyle,
                on("pointerdown", (event) => {
                  drawing = true;
                  const rect = (
                    event.currentTarget as HTMLCanvasElement
                  ).getBoundingClientRect();
                  const scaleX = width / rect.width;
                  const scaleY = height / rect.height;
                  lastX = (event.clientX - rect.left) * scaleX;
                  lastY = (event.clientY - rect.top) * scaleY;
                  (event.currentTarget as HTMLCanvasElement).setPointerCapture(
                    event.pointerId,
                  );
                  const c = ctx();
                  if (c) {
                    c.beginPath();
                    c.arc(lastX, lastY, size / 2, 0, Math.PI * 2);
                    c.fillStyle = color;
                    c.fill();
                  }
                }),
                on("pointermove", (event) => {
                  if (!drawing) return;
                  const c = ctx();
                  if (!c) return;
                  const rect = (
                    event.currentTarget as HTMLCanvasElement
                  ).getBoundingClientRect();
                  const scaleX = width / rect.width;
                  const scaleY = height / rect.height;
                  const x = (event.clientX - rect.left) * scaleX;
                  const y = (event.clientY - rect.top) * scaleY;
                  c.strokeStyle = color;
                  c.lineWidth = size;
                  c.lineCap = "round";
                  c.lineJoin = "round";
                  c.beginPath();
                  c.moveTo(lastX, lastY);
                  c.lineTo(x, y);
                  c.stroke();
                  lastX = x;
                  lastY = y;
                }),
                on("pointerup", () => {
                  drawing = false;
                }),
                on("pointerleave", () => {
                  drawing = false;
                }),
              ]}
            />
          </section>

          <footer mix={footerStyle}>
            <span>
              {selectedName}: {saveCount} save{saveCount === 1 ? "" : "s"}
            </span>
            <span>
              {width}x{height}
            </span>
          </footer>
        </main>
      );
    };
  },
);

const shellStyle = css({
  padding: "16px",
  display: "grid",
  gap: "14px",
  color: "#e2e8f0",
});

const headerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "start",
});

const toolbarStyle = css({
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  alignItems: "start",
});

const fieldStyle = css({
  display: "grid",
  gap: "6px",
  fontSize: "11px",
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
});

const selectStyle = css({
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "6px 8px",
  fontSize: "14px",
});

const colorRowStyle = css({
  display: "flex",
  gap: "6px",
});

const swatchStyle = css({
  width: "24px",
  height: "24px",
  borderRadius: "4px",
  border: "1px solid #475569",
  cursor: "pointer",
  padding: 0,
});

const activeSwatchStyle = css({
  outline: "2px solid #7dd3fc",
  outlineOffset: "1px",
});

const sizeRowStyle = css({
  display: "flex",
  gap: "4px",
});

const sizeBtnStyle = css({
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "13px",
  cursor: "pointer",
  minWidth: "32px",
});

const activeSizeStyle = css({
  outline: "2px solid #7dd3fc",
  outlineOffset: "1px",
});

const actionsStyle = css({
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
});

const btnStyle = css({
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "8px 14px",
  fontSize: "13px",
  cursor: "pointer",
  "&:hover": {
    background: "#334155",
  },
});

const commitBtnStyle = css({
  background: "#14532d",
  color: "#86efac",
  border: "1px solid #166534",
  borderRadius: "6px",
  padding: "8px 14px",
  fontSize: "13px",
  cursor: "pointer",
  "&:hover": {
    background: "#166534",
  },
});

const activeRecordStyle = css({
  background: "#7f1d1d",
  color: "#fca5a5",
  borderColor: "#991b1b",
});

const canvasWrapStyle = css({
  display: "flex",
  justifyContent: "center",
  background: "#020617",
  borderRadius: "8px",
  padding: "12px",
  overflow: "auto",
});

const canvasStyle = css({
  background: "#ffffff",
  touchAction: "none",
  maxWidth: "100%",
  maxHeight: "70vh",
  height: "auto",
  borderRadius: "4px",
  cursor: "crosshair",
});

const footerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  fontSize: "12px",
  color: "#64748b",
});
