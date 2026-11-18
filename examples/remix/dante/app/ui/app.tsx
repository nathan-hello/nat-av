import { css, on, type Handle } from "remix/ui";
import { getRpc } from "@/state";
import { DeviceList } from "@/ui/devices";
import { Matrix, type Crosspoint } from "@/ui/matrix";
import { button, colors, muted, panel } from "@/ui/styles";

type Box = { error: { message: string } | undefined };

export function App(handle: Handle) {
  // getRpc only subscribes the first call per component, so request the
  // named driver first to re-render on its state changes.
  const dante = getRpc(handle, "dante");
  const rpc = getRpc(handle);

  let error: string | null = null;
  // Key of the crosspoint or device whose routing change is in flight.
  let pendingKey: string | null = null;

  async function perform(key: string, call: () => Promise<Box>) {
    pendingKey = key;
    error = null;
    handle.update();
    const result = await call();
    pendingKey = null;
    error = result.error?.message ?? null;
    handle.update();
  }

  function toggle(point: Crosspoint) {
    void perform(point.key, () =>
      point.active ?
        dante.api.unroute(point.rxServer, point.rxChannel)
      : dante.api.route(
          point.rxServer,
          point.rxChannel,
          point.txDevice,
          point.txChannel,
        ),
    );
  }

  function clear(rxServer: string) {
    void perform(`clear:${rxServer}`, () => dante.api.clearRoutes(rxServer));
  }

  function rescan() {
    error = null;
    void dante.api.refresh().then((result) => {
      error = result.error?.message ?? null;
      handle.update();
    });
  }

  return () => {
    const state = dante.state;
    const devices = Object.values(state.devices ?? {}).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    const scanning = state.scanStatus === "scanning";

    return (
      <main mix={shell}>
        <header mix={[panel, header]}>
          <div>
            <h1 mix={title}>Dante Router</h1>
            <p mix={muted}>
              {rpc.isOnline ? statusText(state.scanStatus) : "Server offline"}
              {state.lastScanAt ?
                ` · last scan ${new Date(state.lastScanAt).toLocaleTimeString()}`
              : ""}
              {` · ${devices.length} device${devices.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div mix={actions}>
            <span mix={pill(rpc.isOnline)}>
              {rpc.isOnline ? "Connected" : "Disconnected"}
            </span>
            <button
              type="button"
              disabled={!rpc.isOnline || dante.isPending("setLiveMdns")}
              aria-pressed={state.liveMdns ? "true" : "false"}
              title="Rescan automatically when mDNS reports devices joining or leaving"
              mix={[
                button,
                state.liveMdns ? toggleOn : null,
                on("click", () => void dante.api.setLiveMdns(!state.liveMdns)),
              ]}
            >
              Live mDNS {state.liveMdns ? "on" : "off"}
            </button>
            <button
              type="button"
              disabled={!rpc.isOnline || scanning}
              mix={[button, on("click", rescan)]}
            >
              {scanning ? "Scanning…" : "Rescan"}
            </button>
          </div>
        </header>

        {error && (
          <div mix={errorBanner} role="alert">
            <span>{error}</span>
            <button
              type="button"
              mix={[
                button,
                on("click", () => {
                  error = null;
                  handle.update();
                }),
              ]}
            >
              Dismiss
            </button>
          </div>
        )}

        <Matrix
          devices={devices}
          matrix={state.matrix ?? {}}
          pendingKey={pendingKey}
          disabled={!rpc.isOnline || pendingKey !== null || scanning}
          onToggle={toggle}
          onClear={clear}
        />

        <DeviceList devices={devices} matrix={state.matrix ?? {}} />
      </main>
    );
  };
}

function statusText(status: string | undefined) {
  switch (status) {
    case "scanning":
      return "Scanning the network…";
    case "ready":
      return "Ready";
    case "error":
      return "Last scan failed";
    default:
      return "Waiting for first scan";
  }
}

const shell = css({
  display: "grid",
  gap: "16px",
  padding: "20px",
  maxWidth: "1600px",
  margin: "0 auto",
});
const header = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
});
const title = css({ margin: 0, fontSize: "18px" });
const actions = css({
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
});
const toggleOn = css({
  background: colors.accent,
  borderColor: colors.accent,
  color: "#fff",
});
const pill = (online: boolean) =>
  css({
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    background: online ? "#dcfce7" : "#fee2e2",
    color: online ? "#166534" : "#991b1b",
  });
const errorBanner = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "10px 14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  color: "#991b1b",
});
