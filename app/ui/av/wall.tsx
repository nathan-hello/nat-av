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
  windowId: number;
  uri: string;
  resX: number;
  resY: number;
  offsetX: number;
  offsetY: number;
};

export function Wall(handle: Handle<WallProps>) {
  const display = handle.props.rpc.device(handle.props.deviceName);

  let selectedSource: SourceSelectDetail | null = null;
  let selectedWindowId: number | null = null;
  let form: RouteFormState = {
    windowId: 0,
    uri: "",
    resX: 0,
    resY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  function loadWindow(window: LogicalWindow) {
    selectedWindowId = window.id;
    form = {
      windowId: window.id,
      uri: window.routes[0]?.uri ?? form.uri,
      resX: window.global.resX,
      resY: window.global.resY,
      offsetX: window.global.offsetX,
      offsetY: window.global.offsetY,
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
    if (!state) {
      return (
        <section mix={emptyStyle}>
          Waiting for decoder state: {JSON.stringify(display.state)}
        </section>
      );
    }

    const canRouteFromSelection = !!selectedSource;

    return (
      <section mix={layoutStyle}>
        <aside mix={sidebarStyle}>
          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Sources</h2>
            <div mix={listStyle}>
              {state.encoders.map((source) => (
                <Source
                  key={source.uri}
                  id={source.uri}
                  name={source.name}
                  selected={selectedSource?.id === source.uri}
                  onSelect={(detail) => {
                    selectedSource = selectedSource?.id === detail.id ? null : detail;
                    form = { ...form, uri: detail.id };
                    handle.update();
                  }}
                />
              ))}
            </div>
          </section>

          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Templates</h2>
            <div mix={listStyle}>
              {state.template.choices.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={display.isPending("changeTemplate")}
                  mix={[
                    buttonStyle,
                    on("click", () => {
                      void display.api.changeTemplate(template);
                    }),
                  ]}
                  style={{
                    borderColor: state.template.state.id === template.id ? "#38bdf8" : undefined,
                  }}
                >
                  {(
                    display.isPending("changeTemplate") &&
                    template.id === display.state?.template.state.id
                  ) ?
                    "Switching..."
                  : template.name}
                </button>
              ))}
            </div>
          </section>

          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Window</h2>
            <div mix={fieldListStyle}>
              <label mix={fieldStyle}>
                <span>Window ID</span>
                <input
                  type="number"
                  value={String(form.windowId)}
                  mix={[
                    inputStyle,
                    on("input", (event) => {
                      updateNumberField("windowId", event.currentTarget.value);
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
            <div mix={actionsStyle}>
              <button
                type="button"
                disabled={display.isPending("route") || !form.uri}
                mix={[
                  buttonStyle,
                  primaryButtonStyle,
                  on("click", () => {
                    void display.api.route(form.windowId, form.uri, getGlobal(form));
                  }),
                ]}
              >
                {display.isPending("route") ? "Routing..." : "Route"}
              </button>
              <button
                type="button"
                disabled={display.isPending("move")}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.move(form.windowId, getGlobal(form));
                  }),
                ]}
              >
                {display.isPending("move") ? "Moving..." : "Move"}
              </button>
              <button
                type="button"
                disabled={display.isPending("destroy")}
                mix={[
                  buttonStyle,
                  dangerButtonStyle,
                  on("click", () => {
                    void display.api.destroy(form.windowId);
                  }),
                ]}
              >
                {display.isPending("destroy") ? "Destroying..." : "Destroy"}
              </button>
              <button
                type="button"
                disabled={display.isPending("debug")}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void display.api.debug();
                  }),
                ]}
              >
                {display.isPending("debug") ? "Debugging..." : "Debug"}
              </button>
              <button
                type="button"
                disabled={display.isPending("destroy")}
                mix={[
                  buttonStyle,
                  dangerButtonStyle,
                  on("click", () => {
                    void display.api.destroy("all");
                  }),
                ]}
              >
                {display.isPending("destroy") ? "Wiping..." : "Wipe"}
              </button>
            </div>
          </section>
        </aside>

        <div mix={contentStyle}>
          <section mix={panelStyle}>
            <h2 mix={titleStyle}>Canvas</h2>
            <p mix={metaStyle}>
              Click a source, then click a region to route into it. Click a window to load it into
              the form.
            </p>
            <Decoder
              canvas={state.canvas}
              windows={state.windows}
              template={state.template.state}
              encoders={state.encoders}
              selectedWindowId={selectedWindowId}
              onRegionSelect={(region, global) => {
                selectedWindowId = region.id;
                form = {
                  ...form,
                  windowId: region.id,
                  resX: global.resX,
                  resY: global.resY,
                  offsetX: global.offsetX,
                  offsetY: global.offsetY,
                };

                if (selectedSource) {
                  form = { ...form, uri: selectedSource.id };
                  void display.api.route(region.id, selectedSource.id, global);
                }

                handle.update();
              }}
              onWindowSelect={(window) => {
                loadWindow(window);
                handle.update();
              }}
            />
            <p mix={metaStyle}>
              Selected source: {selectedSource?.name ?? "none"}
              {canRouteFromSelection ? ` (${selectedSource?.id})` : ""}
            </p>
          </section>

          <section mix={panelStyle}>
            <h2 mix={titleStyle}>State</h2>
            <pre mix={stateStyle}>{JSON.stringify(state, null, 2)}</pre>
          </section>
        </div>
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
  gridTemplateColumns: "320px minmax(0, 1fr)",
  alignItems: "start",
  "@media (max-width: 1000px)": {
    gridTemplateColumns: "1fr",
  },
});

const sidebarStyle = css({ display: "grid", gap: "16px" });
const contentStyle = css({ display: "grid", gap: "16px" });
const panelStyle = css({
  display: "grid",
  gap: "12px",
  border: "1px solid #1e293b",
  borderRadius: "16px",
  background: "#0f172a",
  padding: "16px",
});
const titleStyle = css({ margin: 0, fontSize: "14px" });
const listStyle = css({ display: "grid", gap: "8px" });
const fieldListStyle = css({ display: "grid", gap: "10px" });
const fieldStyle = css({ display: "grid", gap: "4px", fontSize: "12px" });
const gridStyle = css({
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
});
const inputStyle = css({
  width: "100%",
  border: "1px solid #334155",
  borderRadius: "10px",
  background: "#020617",
  color: "#e2e8f0",
  font: "inherit",
  padding: "10px 12px",
});
const actionsStyle = css({ display: "flex", gap: "8px", flexWrap: "wrap" });
const buttonStyle = css({
  appearance: "none",
  border: "1px solid #334155",
  borderRadius: "10px",
  background: "#020617",
  color: "#e2e8f0",
  cursor: "pointer",
  font: "inherit",
  padding: "10px 12px",
  "&:disabled": { cursor: "not-allowed", opacity: 0.65 },
});
const primaryButtonStyle = css({ background: "#0f766e", borderColor: "#14b8a6" });
const dangerButtonStyle = css({ background: "#450a0a", borderColor: "#7f1d1d" });
const metaStyle = css({ margin: 0, color: "#94a3b8", fontSize: "12px" });
const stateStyle = css({
  margin: 0,
  color: "#86efac",
  fontSize: "12px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const emptyStyle = css({
  border: "1px dashed #334155",
  borderRadius: "16px",
  color: "#94a3b8",
  padding: "18px",
});
