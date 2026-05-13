import type { DriverSchema, MethodSchema, TypeSchema } from "@av/schema/types";
import { clientEntry, css, on, type Handle, type SerializableProps } from "remix/ui";
import { routes } from "@/routes";
import { DebugClient } from "@/rpc/debug";
import { RemixRpcClient } from "@/rpc/devices";

type Tab = "state" | "api" | "events";

export type DebugSchema = SerializableProps & {
  version: 1;
  format: string;
  entry: { filePath: string; exportName: string };
  roots: string[];
  transport: unknown;
  devices: Record<string, DriverSchema>;
};

type Props = SerializableProps & { schema: DebugSchema; initialDevice: string | null };

export const DebugPage = clientEntry(
  import.meta.url,
  function DebugPage(handle: Handle<Props>) {
    let rpc: RemixRpcClient | null = null;
    let debug: DebugClient | null = null;
    let selected = handle.props.initialDevice;
    let tab: Tab = "state";
    let connected = false;
    let logsConnected = false;

    handle.queueTask((signal) => {
      rpc = new RemixRpcClient();
      debug = new DebugClient();

      rpc.on("ready", () => {
        connected = true;
        handle.update();
      });
      rpc.on("close", () => {
        connected = false;
        handle.update();
      });
      rpc.on("change", handle.update);
      debug.on("ready", () => {
        logsConnected = true;
        handle.update();
      });
      debug.on("close", () => {
        logsConnected = false;
        handle.update();
      });
      debug.on("entry", handle.update);
      signal.addEventListener("abort", () => {
        rpc?.close();
        debug?.close();
      });

      rpc.connect();
      debug.connect();
    });

    return () => {
      let devices = Object.values(handle.props.schema.devices).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      let selectedSchema = selected ? handle.props.schema.devices[selected] : undefined;
      let selectedHandle = selected && rpc ? rpc.device(selected as any) : null;
      let state = selectedHandle?.state ?? selectedSchema?.state;

      return (
        <div mix={shellStyle}>
              <aside mix={sidebarStyle}>
                <div mix={rowStyle}>
                  <strong>Debug</strong>
                  <span>{connected ? "RPC" : "RPC off"}</span>
                </div>
                {devices.map((device) => (
                  <button
                    key={device.name}
                    type="button"
                    mix={[
                      deviceButtonStyle(selected === device.name),
                      on("click", () => {
                        selected = device.name;
                        tab = "state";
                        handle.update();
                      }),
                    ]}
                  >
                    <span>{device.name}</span>
                    <span>
                      {rpc?.system.state.connections[device.name]?.connected ? "on" : "off"}
                    </span>
                  </button>
                ))}
              </aside>

              <main mix={mainStyle}>
                <header mix={rowStyle}>
                  <div>
                    <h1 mix={titleStyle}>Natav debug console</h1>
                    <p mix={mutedStyle}>{logsConnected ? "logs connected" : "logs off"}</p>
                  </div>
                  <div mix={rowStyle}>
                    <a href={routes.home.href()}>Home</a>
                    <a href={routes.schema.href()}>Schema</a>
                  </div>
                </header>

                {selectedSchema ?
                  <>
                    <div mix={tabsStyle}>
                      {(["state", "api", "events"] as Tab[]).map((next) => (
                        <button
                          key={next}
                          type="button"
                          mix={[
                            tabButtonStyle(tab === next),
                            on("click", () => {
                              tab = next;
                              handle.update();
                            }),
                          ]}
                        >
                          {next}
                        </button>
                      ))}
                    </div>

                    {tab === "state" ?
                      <pre mix={boxStyle}>{JSON.stringify(state, null, 2)}</pre>
                    : null}
                    {tab === "api" ?
                      <ApiTab schema={selectedSchema} deviceName={selectedSchema.name} rpc={rpc} />
                    : null}
                    {tab === "events" ?
                      <EventsTab deviceName={selectedSchema.name} debug={debug} />
                    : null}
                  </>
                : <div mix={emptyStyle}>Select a device</div>}
              </main>
        </div>
      );
    };
  },
);

function ApiTab(
  handle: Handle<{ schema: DriverSchema; deviceName: string; rpc: RemixRpcClient | null }>,
) {
  return () => {
    let methods = Object.entries(handle.props.schema.methods);
    if (!methods.length) return <div mix={emptyStyle}>No API methods</div>;

    return (
      <div mix={stackStyle}>
        {methods.map(([name, method]) => (
          <Method
            key={name}
            name={name}
            method={method}
            deviceName={handle.props.deviceName}
            rpc={handle.props.rpc}
          />
        ))}
      </div>
    );
  };
}

function Method(
  handle: Handle<{
    name: string;
    method: MethodSchema;
    deviceName: string;
    rpc: RemixRpcClient | null;
  }>,
) {
  let argsText = "[]";
  let result: string | null = null;

  return () => (
    <section mix={cardStyle}>
      <div mix={rowStyle}>
        <strong>{handle.props.name}</strong>
        <span>{handle.props.method.params.map((p) => p.name).join(", ") || "no params"}</span>
      </div>
      <textarea
        mix={[
          inputStyle,
          on("change", (event) => {
            argsText = (event.currentTarget as HTMLTextAreaElement).value;
          }),
        ]}
        rows={3}
        value={argsText}
      />
      <button
        type="button"
        mix={[
          buttonStyle,
          on("click", async () => {
            if (!handle.props.rpc) return;
            try {
              result = JSON.stringify(
                await handle.props.rpc.call(
                  handle.props.deviceName,
                  handle.props.name,
                  JSON.parse(argsText || "[]"),
                ),
                null,
                2,
              );
            } catch (error) {
              result = error instanceof Error ? error.message : String(error);
            }
            handle.update();
          }),
        ]}
      >
        Call
      </button>
      {result ?
        <pre mix={boxStyle}>{result}</pre>
      : null}
    </section>
  );
}

function EventsTab(handle: Handle<{ deviceName: string; debug: DebugClient | null }>) {
  return () => {
    let logs =
      handle.props.debug?.logs.filter(
        (entry) => entry.context.traceName === handle.props.deviceName,
      ) ?? [];
    return (
      <div mix={stackStyle}>
        <div mix={rowStyle}>
          <span>{logs.length} events</span>
          {handle.props.debug ?
            <button
              type="button"
              mix={[
                buttonStyle,
                on("click", () => {
                  handle.props.debug?.clear();
                  handle.update();
                }),
              ]}
            >
              Clear
            </button>
          : null}
        </div>
        {logs.length ?
          logs.map((log, i) => (
            <pre key={i} mix={boxStyle}>
              {JSON.stringify(log, null, 2)}
            </pre>
          ))
        : <div mix={emptyStyle}>No events</div>}
      </div>
    );
  };
}

function defaultValue(schema: TypeSchema): unknown {
  if (schema.kind === "primitive")
    return (
      schema.type === "boolean" ? false
      : schema.type === "number" || schema.type === "bigint" ? 0
      : ""
    );
  if (schema.kind === "literal") return schema.value;
  if (schema.kind === "array") return [];
  if (schema.kind === "tuple") return schema.items.map(defaultValue);
  if (schema.kind === "union") return defaultValue(schema.members[0]);
  if (schema.kind === "object")
    return Object.fromEntries(
      Object.entries(schema.properties)
        .filter(([, prop]) => prop.required)
        .map(([key, prop]) => [key, defaultValue(prop.type)]),
    );
  return "";
}

function schemaLabel(schema: TypeSchema): string {
  if (schema.kind === "primitive") return schema.type;
  if (schema.kind === "literal") return JSON.stringify(schema.value);
  if (schema.kind === "reference") return schema.name;
  if (schema.kind === "object") return "{...}";
  if (schema.kind === "array") return "[...]";
  if (schema.kind === "tuple") return "(...)";
  return "union";
}

const bodyStyle = css({
  margin: 0,
  minHeight: "100vh",
  background: "#020617",
  color: "#e2e8f0",
  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
});
const shellStyle = css({
  display: "grid",
  gridTemplateColumns: "240px 1fr",
  minHeight: "100vh",
  "@media (max-width: 800px)": { gridTemplateColumns: "1fr" },
});
const sidebarStyle = css({
  padding: "12px",
  borderRight: "1px solid #1e293b",
  display: "grid",
  gap: "8px",
});
const mainStyle = css({ padding: "12px", display: "grid", gap: "12px" });
const titleStyle = css({ margin: 0, fontSize: "24px" });
const mutedStyle = css({ margin: 0, color: "#94a3b8" });
const rowStyle = css({
  display: "flex",
  gap: "8px",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
});
const tabsStyle = css({ display: "flex", gap: "8px" });
const stackStyle = css({ display: "grid", gap: "8px" });
const cardStyle = css({
  padding: "10px",
  border: "1px solid #334155",
  borderRadius: "10px",
  display: "grid",
  gap: "8px",
  background: "#0f172a",
});
const buttonStyle = css({
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "inherit",
  cursor: "pointer",
});
const inputStyle = css({
  width: "100%",
  padding: "8px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#020617",
  color: "inherit",
  fontFamily: "inherit",
});
const boxStyle = css({
  margin: 0,
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "#020617",
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
const tabButtonStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    cursor: "pointer",
  });
const deviceButtonStyle = (active: boolean) =>
  css({
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid " + (active ? "#38bdf8" : "#334155"),
    background: active ? "#0f172a" : "#020617",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
  });
