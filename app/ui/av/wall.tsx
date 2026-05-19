import { css, on, type Handle } from "remix/ui";
import type { LogicalWindow } from "@av/drivers/decoder/impl/display";
import type { ClientRpc } from "@av/rpc/client";
import { Decoder } from "@/ui/av/decoder";
import { Source, type SourceSelectDetail } from "@/ui/av/source";

interface WallProps {
  rpc: ClientRpc;
  deviceName: "video-wall";
}

type RouteFormState = {
  dwindowId: number;
  uri: string;
  audioOutput: string;
  resX: number;
  resY: number;
  offsetX: number;
  offsetY: number;
};

type InteractionMode = "free" | "snap";

export function Wall(handle: Handle<WallProps>) {
  const display = handle.props.rpc.device(handle.props.deviceName);

  let mode: InteractionMode = "free";
  let selectedSource: SourceSelectDetail | null = null;
  let selectedWindowId: number | null = null;
  let form: RouteFormState = {
    dwindowId: 0,
    uri: "",
    audioOutput: "",
    resX: 0,
    resY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  function getAudioOutputKey(output: { decoderIndex: number; output: number }) {
    return `${output.decoderIndex}:${output.output}`;
  }

  function parseAudioOutputKey(value: string) {
    const [decoderIndex, output] = value.split(":").map((part) => Number.parseInt(part, 10));
    return Number.isFinite(decoderIndex) && Number.isFinite(output) ? { decoderIndex, output } : null;
  }

  function loadWindow(dwindow: LogicalWindow, source?: SourceSelectDetail | null) {
    selectedWindowId = dwindow.id;
    form = {
      dwindowId: dwindow.id,
      uri: source?.id ?? dwindow.routes[0]?.uri ?? form.uri,
      audioOutput: form.audioOutput,
      resX: dwindow.global.resX,
      resY: dwindow.global.resY,
      offsetX: dwindow.global.offsetX,
      offsetY: dwindow.global.offsetY,
    };
  }

  function updateNumberField(field: keyof RouteFormState, value: string) {
    form = {
      ...form,
      [field]: Number.parseInt(value, 10) || 0,
    };
  }

  return () => {
    const state = display.state;

    if (state && form.resX === 0 && form.resY === 0 && state.windows[0]) {
      loadWindow(state.windows[0], selectedSource);
    }

    if (state && !form.uri && state.encoders[0]) {
      selectedSource = selectedSource ?? {
        id: state.encoders[0].uri,
        name: state.encoders[0].name,
      };
      form = { ...form, uri: selectedSource.id };
    }

    if (state && !form.audioOutput && state.audioOutputs[0]) {
      form = { ...form, audioOutput: getAudioOutputKey(state.audioOutputs[0]) };
    }

    const movePending = display.isPending("move");
    const routePending = display.isPending("route");
    const changeTemplatePending = display.isPending("changeTemplate");
    const destroyPending = display.isPending("destroy");
    const debugPending = display.isPending("debug");
    const audioOutputs = state ? state.audioOutputs : [];
    const scale = state ? Math.min(1, 1280 / state.canvas.width) : 0.7;

    return (
      <section mix={layoutStyle}>
        <div mix={canvasColumnStyle}>
          <section mix={panelStyle}>
            <div mix={toolbarStyle}>
              <div>
                <h2 mix={titleStyle}>Canvas</h2>
                <p mix={mutedStyle}>
                  {mode === "free" ?
                    "Drag windows freely. A move RPC is sent as the pointer moves."
                  : "Drag a source onto a region or existing window to snap-route it."}
                </p>
              </div>
              <div mix={modeToggleStyle}>
                {(["free", "snap"] as InteractionMode[]).map((nextMode) => (
                  <button
                    key={nextMode}
                    type="button"
                    mix={[
                      toggleButtonStyle,
                      on("click", () => {
                        mode = nextMode;
                        handle.update();
                      }),
                    ]}
                    style={{
                      background: mode === nextMode ? "#fff" : undefined,
                      color: mode === nextMode ? "#000" : undefined,
                    }}
                  >
                    {nextMode === "free" ? "Free drag" : "Snap route"}
                  </button>
                ))}
              </div>
            </div>

            {state ?
              <>
                <div mix={statusRowStyle}>
                  <span mix={statusPillStyle}>mode: {mode}</span>
                  <span mix={statusPillStyle}>{movePending ? "move pending" : "move idle"}</span>
                  <span mix={statusPillStyle}>{routePending ? "route pending" : "route idle"}</span>
                </div>
                <div mix={canvasViewportStyle}>
                  <Decoder
                    canvas={state.canvas}
                    windows={state.windows}
                    template={state.template.state}
                    encoders={state.encoders}
                    scale={scale}
                    mode={mode}
                    movePending={movePending}
                    routePending={routePending}
                    selectedWindowId={selectedWindowId}
                    onRegionSelect={(region, global) => {
                      selectedWindowId = region.id;
                      form = {
                        dwindowId: region.id,
                        uri: selectedSource?.id ?? form.uri,
                        audioOutput: form.audioOutput,
                        resX: global.resX,
                        resY: global.resY,
                        offsetX: global.offsetX,
                        offsetY: global.offsetY,
                      };

                      if (selectedSource && !routePending) {
                        void display.api.route(region.id, selectedSource.id, global);
                      }

                      handle.update();
                    }}
                    onWindowSelect={(dwindow) => {
                      loadWindow(dwindow, selectedSource);

                      if (selectedSource && !routePending) {
                        void display.api.route(dwindow.id, selectedSource.id, dwindow.global);
                      }

                      handle.update();
                    }}
                    onWindowMoveEnd={(dwindow, global) => {
                      loadWindow({ ...dwindow, global }, selectedSource);
                      void display.api.move(dwindow.id, global);
                      handle.update();
                    }}
                    onSourceDropToRegion={(region, global, source) => {
                        selectedSource = source;
                        selectedWindowId = region.id;
                        form = {
                          dwindowId: region.id,
                          uri: source.id,
                          audioOutput: form.audioOutput,
                          resX: global.resX,
                          resY: global.resY,
                          offsetX: global.offsetX,
                          offsetY: global.offsetY,
                        };
                        void display.api.route(region.id, source.id, global);
                        handle.update();
                      }}
                    onSourceDropToWindow={(dwindow, source) => {
                      selectedSource = source;
                      loadWindow(dwindow, source);
                      void display.api.route(dwindow.id, source.id, dwindow.global);
                      handle.update();
                    }}
                  />
                </div>
              </>
            : <div mix={emptyStyle}>Waiting for live decoder state...</div>}
          </section>

          <section mix={panelStyle}>
            <div mix={toolbarStyle}>
              <h2 mix={titleStyle}>Sources</h2>
              <p mix={mutedStyle}>Selected: {selectedSource?.name ?? "none"}</p>
            </div>
            {state ?
              <div mix={sourceListStyle}>
                {state.encoders.map((source) => (
                  <Source
                    key={source.uri}
                    id={source.uri}
                    name={source.name}
                    selected={selectedSource?.id === source.uri}
                    onSelect={(detail) => {
                      selectedSource = selectedSource?.id === detail.id ? null : detail;
                      form = { ...form, uri: selectedSource?.id ?? "" };
                      handle.update();
                    }}
                  />
                ))}
              </div>
            : <p mix={mutedStyle}>No source list yet.</p>}
          </section>
        </div>

        <aside mix={sidebarStyle}>
          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Route</h2>
            <div mix={fieldListStyle}>
              <label mix={fieldStyle}>
                <span>Audio Output</span>
                <select
                  value={form.audioOutput}
                  mix={[
                    inputStyle,
                    on("change", (event) => {
                      form = { ...form, audioOutput: event.currentTarget.value };
                      handle.update();
                    }),
                  ]}
                >
                  <option value="">Select an audio output</option>
                  {audioOutputs.map((output) => (
                    <option key={getAudioOutputKey(output)} value={getAudioOutputKey(output)}>
                      {`decoder ${output.decoderIndex} output ${output.output}${output.type ? ` (${output.type})` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <label mix={fieldStyle}>
                <span>Window ID</span>
                <input
                  type="number"
                  value={String(form.dwindowId)}
                  mix={[
                    inputStyle,
                    on("input", (event) => {
                      updateNumberField("dwindowId", event.currentTarget.value);
                      handle.update();
                    }),
                  ]}
                />
              </label>
              <label mix={fieldStyle}>
                <span>URI</span>
                <input
                  type="text"
                  value={form.uri}
                  mix={[
                    inputStyle,
                    on("input", (event) => {
                      form = { ...form, uri: event.currentTarget.value };
                      handle.update();
                    }),
                  ]}
                />
              </label>
              <div mix={gridStyle}>
                <label mix={fieldStyle}>
                  <span>X</span>
                  <input
                    type="number"
                    value={String(form.offsetX)}
                    mix={[
                      inputStyle,
                      on("input", (event) => {
                        updateNumberField("offsetX", event.currentTarget.value);
                        handle.update();
                      }),
                    ]}
                  />
                </label>
                <label mix={fieldStyle}>
                  <span>Y</span>
                  <input
                    type="number"
                    value={String(form.offsetY)}
                    mix={[
                      inputStyle,
                      on("input", (event) => {
                        updateNumberField("offsetY", event.currentTarget.value);
                        handle.update();
                      }),
                    ]}
                  />
                </label>
                <label mix={fieldStyle}>
                  <span>W</span>
                  <input
                    type="number"
                    value={String(form.resX)}
                    mix={[
                      inputStyle,
                      on("input", (event) => {
                        updateNumberField("resX", event.currentTarget.value);
                        handle.update();
                      }),
                    ]}
                  />
                </label>
                <label mix={fieldStyle}>
                  <span>H</span>
                  <input
                    type="number"
                    value={String(form.resY)}
                    mix={[
                      inputStyle,
                      on("input", (event) => {
                        updateNumberField("resY", event.currentTarget.value);
                        handle.update();
                      }),
                    ]}
                  />
                </label>
              </div>
            </div>

            <div mix={buttonRowStyle}>
              <button
                type="button"
                disabled={routePending || !form.uri}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.route(form.dwindowId, form.uri, getGlobal(form));
                  }),
                ]}
              >
                {routePending ? "Routing..." : "Route"}
              </button>
              <button
                type="button"
                disabled={!form.uri || !form.audioOutput}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    const selected = parseAudioOutputKey(form.audioOutput);
                    if (!selected || !form.uri) return;
                    void display.api.routeAudio(form.uri, selected);
                  }),
                ]}
              >
                Route audio
              </button>
              <button
                type="button"
                disabled={movePending}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.move(form.dwindowId, getGlobal(form));
                  }),
                ]}
              >
                {movePending ? "Moving..." : "Move"}
              </button>
              <button
                type="button"
                disabled={destroyPending}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.destroy(form.dwindowId);
                  }),
                ]}
              >
                {destroyPending ? "Destroying..." : "Destroy"}
              </button>
              <button
                type="button"
                disabled={destroyPending}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.destroy("all");
                  }),
                ]}
              >
                {destroyPending ? "Wiping..." : "Wipe"}
              </button>
            </div>
          </section>

          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Templates</h2>
            {state ?
              <div mix={templateListStyle}>
                {state.template.choices.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={changeTemplatePending}
                    mix={[
                      buttonStyle,
                      on("click", () => {
                        void display.api.changeTemplate(template);
                      }),
                    ]}
                    style={{
                      background: state.template.state.id === template.id ? "#fff" : undefined,
                      color: state.template.state.id === template.id ? "#000" : undefined,
                    }}
                  >
                    {changeTemplatePending && state.template.state.id === template.id ?
                      "Switching..."
                    : template.name}
                  </button>
                ))}
              </div>
            : <p mix={mutedStyle}>Waiting for templates...</p>}
          </section>

          <section mix={panelStyle}>
            <div mix={toolbarStyle}>
              <h2 mix={titleStyle}>Debug</h2>
              <button
                type="button"
                disabled={debugPending}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.debug();
                  }),
                ]}
              >
                {debugPending ? "Running..." : "Toggle debug"}
              </button>
            </div>
            {state ?
              <pre mix={stateStyle}>{JSON.stringify(state, null, 2)}</pre>
            : <div mix={emptyStyle}>No state yet.</div>}
          </section>
        </aside>
      </section>
    );
  };
}

function getGlobal(form: RouteFormState) {
  return {
    resX: form.resX,
    resY: form.resY,
    offsetX: form.offsetX,
    offsetY: form.offsetY,
  };
}

const layoutStyle = css({
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  alignItems: "start",
  "@media (max-width: 1200px)": {
    gridTemplateColumns: "1fr",
  },
});

const canvasColumnStyle = css({ display: "grid", gap: "16px" });
const sidebarStyle = css({ display: "grid", gap: "16px" });
const panelStyle = css({
  background: "#fff",
  border: "1px solid #d4d4d4",
  color: "#000",
  display: "grid",
  gap: "12px",
  padding: "16px",
});
const toolbarStyle = css({
  display: "flex",
  gap: "12px",
  justifyContent: "space-between",
  alignItems: "start",
  flexWrap: "wrap",
});
const titleStyle = css({ margin: 0, fontSize: "15px" });
const mutedStyle = css({ margin: "4px 0 0", color: "#666", fontSize: "12px" });
const modeToggleStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap" });
const toggleButtonStyle = css({
  appearance: "none",
  background: "#fff",
  border: "1px solid #c0c0c0",
  color: "#000",
  cursor: "pointer",
  font: "inherit",
  padding: "8px 12px",
});
const statusRowStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap" });
const statusPillStyle = css({
  border: "1px solid #d0d0d0",
  color: "#444",
  fontSize: "12px",
  padding: "6px 10px",
});
const canvasViewportStyle = css({
  overflow: "auto",
  border: "1px solid #d4d4d4",
  background: "#fafafa",
  padding: "12px",
});
const sourceListStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap" });
const fieldListStyle = css({ display: "grid", gap: "10px" });
const fieldStyle = css({ display: "grid", gap: "4px", fontSize: "12px" });
const gridStyle = css({
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
});
const inputStyle = css({
  width: "100%",
  appearance: "none",
  background: "#fff",
  border: "1px solid #c0c0c0",
  color: "#000",
  font: "inherit",
  padding: "10px 12px",
});
const buttonRowStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap" });
const buttonStyle = css({
  appearance: "none",
  background: "#fff",
  border: "1px solid #c0c0c0",
  color: "#000",
  cursor: "pointer",
  font: "inherit",
  padding: "10px 12px",
  "&:disabled": { cursor: "not-allowed", opacity: 0.55 },
});
const templateListStyle = css({ display: "grid", gap: "8px" });
const stateStyle = css({
  margin: 0,
  color: "#000",
  fontSize: "12px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const emptyStyle = css({
  border: "1px dashed #c0c0c0",
  color: "#666",
  padding: "18px",
});
