import { clientEntry, css, on, type Handle, type RemixNode } from "remix/ui";

import { routes } from "../../routes.ts";
import { createRemixRpcClient, type RemixRpcClient } from "../../rpc/devices.ts";

type Template = {
  type: "builtin";
  id: number;
  name: string;
  dimensions: { rows: number; cols: number };
  regions: Array<{ id: number; row: number; col: number; width: number; height: number }>;
};
type Window = {
  id: number;
  global: { resX: number; resY: number; offsetX: number; offsetY: number };
  routes: Array<{ uri: string }>;
};
type Display = {
  canvas: { width: number; height: number };
  windows: Window[];
  encoders: Array<{ name: string; uri: string }>;
  template: { choices: Template[]; state: Template };
};
type Source = { id: string; name: string };

export const HomePage = clientEntry(
  "/assets/app/controllers/home/page.tsx#HomePage",
  function HomePage(handle: Handle) {
    let rpc: RemixRpcClient | null = null;
    let connected = false;
    let error: string | null = null;
    let selectedSource: Source | null = null;
    let selectedWindow: number | null = null;
    let routeForm = {
      windowId: 0,
      uri: "udp://239.0.0.1:1234?pkt_size=1316",
      resX: 1920,
      resY: 1080,
      offsetX: 0,
      offsetY: 0,
    };
    let moveForm = { resX: 1920, resY: 1080, offsetX: 0, offsetY: 0 };

    handle.queueTask((signal) => {
      rpc = createRemixRpcClient();
      let update = () => handle.update();
      rpc.on("ready", () => {
        connected = true;
        update();
      });
      rpc.on("disconnect", () => {
        connected = false;
        update();
      });
      rpc.on("change", update);
      signal.addEventListener("abort", () => rpc?.close());
    });

    return () => {
      let display = rpc?.device("video-wall");
      let state = display?.state as Display | undefined;
      let template = state?.template.state;

      if (!state || !template) {
        return <div mix={pageStyle}>Loading decoder state...</div>;
      }

      let canvasW = state.canvas.width;
      let canvasH = state.canvas.height;
      let scale = canvasW ? Math.min(1, 760 / canvasW) : 1;

      let routeWindow = async () => {
        if (!display) return;
        try {
          await display.api.route(routeForm.windowId, routeForm.uri, {
            resX: routeForm.resX,
            resY: routeForm.resY,
            offsetX: routeForm.offsetX,
            offsetY: routeForm.offsetY,
          });
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      let moveWindow = async () => {
        if (!display || selectedWindow === null) return;
        try {
          await display.api.move(selectedWindow, {
            resX: moveForm.resX,
            resY: moveForm.resY,
            offsetX: moveForm.offsetX,
            offsetY: moveForm.offsetY,
          });
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      let destroyWindow = async (id: number | "all") => {
        if (!display) return;
        try {
          await display.api.destroy(id);
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      let changeTemplate = async (next: Template) => {
        if (!display) return;
        try {
          await display.api.changeTemplate(next);
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      let routeWindowWithSource = async (window: Window, source: Source) => {
        if (!display) return;
        try {
          await display.api.route(window.id, source.id, window.global);
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      let routeRegionWithSource = async (region: Template["regions"][number], source: Source) => {
        if (!display) return;
        let unitW = canvasW / (template.dimensions.cols * 2);
        let unitH = canvasH / (template.dimensions.rows * 2);
        try {
          await display.api.route(region.id, source.id, {
            resX: region.width * unitW,
            resY: region.height * unitH,
            offsetX: region.col * unitW,
            offsetY: canvasH - (region.row + region.height) * unitH,
          });
          error = null;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        handle.update();
      };

      return (
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="color-scheme" content="dark" />
            <title>Decoder Control</title>
            <link rel="stylesheet" href={routes.assets.href({ path: "app/assets/tailwind.css" })} />
            <script
              type="module"
              src={routes.assets.href({ path: "app/assets/entry.ts" })}
            ></script>
          </head>
          <body mix={pageStyle}>
            <div mix={wrapStyle}>
              <header mix={headStyle}>
                <div>
                  <h1 mix={titleStyle}>Decoder Control</h1>
                  <p>video-wall</p>
                </div>
                <div mix={rowStyle}>
                  <span>{connected ? "RPC" : "RPC off"}</span>
                  <a href={routes.debug.href()}>Debug</a>
                </div>
              </header>
              {error ?
                <div mix={errorStyle}>{error}</div>
              : null}

              <div mix={layoutStyle}>
                <aside mix={sideStyle}>
                  <Panel title="Route Window">
                    <Field label="Window ID">
                      <input
                        type="number"
                        value={routeForm.windowId}
                        mix={[
                          inputStyle,
                          on("change", (e) => {
                            routeForm.windowId =
                              Number((e.currentTarget as HTMLInputElement).value) || 0;
                          }),
                        ]}
                      />
                    </Field>
                    <Field label="URI">
                      <input
                        type="text"
                        value={routeForm.uri}
                        mix={[
                          inputStyle,
                          on("change", (e) => {
                            routeForm.uri = (e.currentTarget as HTMLInputElement).value;
                          }),
                        ]}
                      />
                    </Field>
                    <Grid4>
                      <Field label="X">
                        <input
                          type="number"
                          value={routeForm.offsetX}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              routeForm.offsetX =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="Y">
                        <input
                          type="number"
                          value={routeForm.offsetY}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              routeForm.offsetY =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="W">
                        <input
                          type="number"
                          value={routeForm.resX}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              routeForm.resX =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="H">
                        <input
                          type="number"
                          value={routeForm.resY}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              routeForm.resY =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                    </Grid4>
                    <Row>
                      <button
                        type="button"
                        mix={[
                          buttonStyle,
                          on("click", () => {
                            void routeWindow();
                          }),
                        ]}
                      >
                        Route
                      </button>
                      <button
                        type="button"
                        mix={[
                          buttonStyle,
                          on("click", () => {
                            void destroyWindow(routeForm.windowId);
                          }),
                        ]}
                      >
                        Destroy
                      </button>
                    </Row>
                  </Panel>

                  <Panel title="Move Window">
                    <Field label="Selected">
                      <input
                        type="number"
                        value={selectedWindow ?? -1}
                        mix={[
                          inputStyle,
                          on("change", (e) => {
                            selectedWindow = Number((e.currentTarget as HTMLInputElement).value);
                            if (selectedWindow < 0) selectedWindow = null;
                          }),
                        ]}
                      />
                    </Field>
                    <Grid4>
                      <Field label="X">
                        <input
                          type="number"
                          value={moveForm.offsetX}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              moveForm.offsetX =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="Y">
                        <input
                          type="number"
                          value={moveForm.offsetY}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              moveForm.offsetY =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="W">
                        <input
                          type="number"
                          value={moveForm.resX}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              moveForm.resX =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                      <Field label="H">
                        <input
                          type="number"
                          value={moveForm.resY}
                          mix={[
                            inputStyle,
                            on("change", (e) => {
                              moveForm.resY =
                                Number((e.currentTarget as HTMLInputElement).value) || 0;
                            }),
                          ]}
                        />
                      </Field>
                    </Grid4>
                    <Row>
                      <button
                        type="button"
                        mix={[
                          buttonStyle,
                          on("click", () => {
                            void moveWindow();
                          }),
                        ]}
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        mix={[
                          buttonStyle,
                          on("click", () => {
                            void destroyWindow("all");
                          }),
                        ]}
                      >
                        Wipe
                      </button>
                      <button
                        type="button"
                        mix={[
                          buttonStyle,
                          on("click", () => {
                            void display?.api.debug();
                          }),
                        ]}
                      >
                        Debug
                      </button>
                    </Row>
                  </Panel>

                  <Panel title="Templates">
                    <Stack>
                      {state.template.choices.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          mix={[
                            templateStyle(template.id === t.id),
                            on("click", () => {
                              void changeTemplate(t);
                            }),
                          ]}
                        >
                          {t.name}
                        </button>
                      ))}
                    </Stack>
                  </Panel>
                </aside>

                <main mix={mainStyle}>
                  <div mix={canvasInfoStyle}>
                    {canvasW}x{canvasH}{" "}
                    {selectedSource ? `source: ${selectedSource.name}` : "pick a source"}
                  </div>
                  <div
                    mix={canvasStyle}
                    style={{ width: canvasW * scale, height: canvasH * scale }}
                  >
                    {template.regions.map((region) => {
                      let unitW = canvasW / (template.dimensions.cols * 2);
                      let unitH = canvasH / (template.dimensions.rows * 2);
                      let left = region.col * unitW,
                        top = region.row * unitH,
                        width = region.width * unitW,
                        height = region.height * unitH;
                      return (
                        <button
                          key={region.id + ":" + region.row + ":" + region.col}
                          type="button"
                          mix={[
                            regionStyle,
                            on("click", () => {
                              if (selectedSource)
                                void routeRegionWithSource(region, selectedSource);
                            }),
                          ]}
                          style={{
                            left: left * scale,
                            top: top * scale,
                            width: width * scale,
                            height: height * scale,
                          }}
                        >
                          R{region.id}
                        </button>
                      );
                    })}
                    {state.windows.map((window) => {
                      let top = canvasH - window.global.offsetY - window.global.resY;
                      let sourceName =
                        state.encoders.find((e) => e.uri === window.routes[0]?.uri)?.name ??
                        "Blank";
                      return (
                        <button
                          key={window.id}
                          type="button"
                          mix={[
                            windowStyle(selectedWindow === window.id),
                            on("click", () => {
                              if (selectedSource)
                                void routeWindowWithSource(window, selectedSource);
                              else {
                                selectedWindow = window.id;
                                moveForm = { ...window.global };
                                void handle.update();
                              }
                            }),
                          ]}
                          style={{
                            left: window.global.offsetX * scale,
                            top: top * scale,
                            width: window.global.resX * scale,
                            height: window.global.resY * scale,
                          }}
                        >
                          {sourceName}
                        </button>
                      );
                    })}
                  </div>

                  <Panel title="Sources">
                    <Row wrap>
                      {state.encoders.map((encoder) => (
                        <button
                          key={encoder.uri}
                          type="button"
                          mix={[
                            sourceStyle(selectedSource?.id === encoder.uri),
                            on("click", () => {
                              selectedSource =
                                selectedSource?.id === encoder.uri ?
                                  null
                                : { id: encoder.uri, name: encoder.name };
                              void handle.update();
                            }),
                          ]}
                        >
                          {encoder.name}
                        </button>
                      ))}
                    </Row>
                  </Panel>

                  <Panel title="State">
                    <pre mix={boxStyle}>{JSON.stringify(state, null, 2)}</pre>
                  </Panel>
                </main>
              </div>
            </div>
          </body>
        </html>
      );
    };
  },
);

function Panel(handle: Handle<{ title: string; children?: RemixNode }>) {
  return () => (
    <section mix={panelStyle}>
      <h2 mix={panelTitleStyle}>{handle.props.title}</h2>
      {handle.props.children}
    </section>
  );
}
function Field(handle: Handle<{ label: string; children?: RemixNode }>) {
  return () => (
    <label mix={fieldStyle}>
      <span>{handle.props.label}</span>
      {handle.props.children}
    </label>
  );
}
function Row(handle: Handle<{ children?: RemixNode; wrap?: boolean }>) {
  return () => <div mix={handle.props.wrap ? rowWrapStyle : rowStyle}>{handle.props.children}</div>;
}
function Grid4(handle: Handle<{ children?: RemixNode }>) {
  return () => <div mix={grid4Style}>{handle.props.children}</div>;
}
function Stack(handle: Handle<{ children?: RemixNode }>) {
  return () => <div mix={stackStyle}>{handle.props.children}</div>;
}

const pageStyle = css({
  margin: 0,
  minHeight: "100vh",
  background: "#020617",
  color: "#e2e8f0",
  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
});
const wrapStyle = css({ padding: "12px", display: "grid", gap: "12px" });
const headStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  flexWrap: "wrap",
});
const titleStyle = css({ margin: 0, fontSize: "24px" });
const rowStyle = css({ display: "flex", gap: "8px", alignItems: "center" });
const rowWrapStyle = css({ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" });
const layoutStyle = css({
  display: "grid",
  gridTemplateColumns: "300px 1fr",
  gap: "12px",
  alignItems: "start",
  "@media (max-width: 900px)": { gridTemplateColumns: "1fr" },
});
const sideStyle = css({ display: "grid", gap: "12px" });
const mainStyle = css({ display: "grid", gap: "12px" });
const panelStyle = css({
  padding: "10px",
  border: "1px solid #334155",
  borderRadius: "10px",
  background: "#0f172a",
  display: "grid",
  gap: "8px",
});
const panelTitleStyle = css({
  margin: 0,
  fontSize: "12px",
  textTransform: "uppercase",
  color: "#94a3b8",
  letterSpacing: "0.08em",
});
const fieldStyle = css({ display: "grid", gap: "4px" });
const grid4Style = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
});
const inputStyle = css({
  width: "100%",
  padding: "8px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
});
const buttonStyle = css({
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
  cursor: "pointer",
});
const templateStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  });
const sourceStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "999px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    cursor: "pointer",
  });
const canvasInfoStyle = css({ fontSize: "12px", color: "#94a3b8" });
const canvasStyle = css({
  position: "relative",
  border: "1px solid #334155",
  borderRadius: "10px",
  background: "#030712",
  overflow: "hidden",
});
const regionStyle = css({
  position: "absolute",
  border: "1px dashed #334155",
  background: "transparent",
  color: "#64748b",
  fontSize: "11px",
  cursor: "copy",
});
const windowStyle = (active: boolean) =>
  css({
    position: "absolute",
    border: "1px solid " + (active ? "#38bdf8" : "#475569"),
    background: active ? "rgba(14,165,233,0.15)" : "rgba(15,23,42,0.85)",
    color: "#e2e8f0",
    fontSize: "11px",
    cursor: "pointer",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  });
const boxStyle = css({
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: "12px",
});
const emptyStyle = css({
  padding: "12px",
  border: "1px dashed #334155",
  borderRadius: "10px",
  color: "#64748b",
});
const errorStyle = css({
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #7f1d1d",
  background: "#450a0a",
  color: "#fca5a5",
});
const stackStyle = css({ display: "grid", gap: "8px" });
