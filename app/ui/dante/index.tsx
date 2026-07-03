import { getRpc } from "@/state";
import type {
  DanteChannel,
  DanteDeviceRecord,
  DanteRouterMatrix,
} from "@drivers/dante/router/types";
import { Fragment, css, on, type Handle } from "remix/ui";

type RouteFormState = {
  rxDevice: string;
  rxChannel: number;
  txDevice: string;
  txChannelName: string;
};

export function DantePage(handle: Handle) {
  const dante = getRpc(handle, "dante");

  let form: RouteFormState = {
    rxDevice: "",
    rxChannel: 0,
    txDevice: "",
    txChannelName: "",
  };
  let didAutoRefresh = false;
  let lastError: string | null = null;

  dante.on("after:response:error", (event) => {
    lastError = event.error.error.message;
    handle.update();
  });
  dante.on("after:response:ok", () => {
    if (lastError) {
      lastError = null;
      handle.update();
    }
  });

  return () => {
    const state = dante.state;
    const devices = (state.devices ?? {}) as Record<string, DanteDeviceRecord>;
    const matrix = state.matrix ?? {};
    const deviceList = Object.values(devices);
    const matrixEntries = Object.entries(matrix);

    if (
      !didAutoRefresh &&
      state.scanStatus === "idle" &&
      state.lastScanAt === null &&
      dante.pendingCount("refresh") === 0
    ) {
      didAutoRefresh = true;
      handle.queueTask(() => {
        void dante.api.refresh();
      });
    }

    const rxDevice =
      form.rxDevice && devices[form.rxDevice]
        ? form.rxDevice
        : deviceList.length > 0
          ? deviceList[0].serverName
          : "";
    const txDevice =
      form.txDevice && devices[form.txDevice]
        ? form.txDevice
        : deviceList.length > 0
          ? deviceList[0].serverName
          : "";

    const rxDev = rxDevice ? devices[rxDevice] : undefined;
    const txDev = txDevice ? devices[txDevice] : undefined;
    const rxChannels = rxDev ? [...rxDev.rxChannels.values()] : [];
    const txChannels = txDev ? [...txDev.txChannels.values()] : [];

    const rxChannel =
      rxChannels.length > 0 &&
      rxChannels.some((c) => c.number === form.rxChannel)
        ? form.rxChannel
        : rxChannels.length > 0
          ? rxChannels[0].number
          : 0;
    const txChannelName =
      txChannels.length > 0 &&
      txChannels.some((c) => c.name === form.txChannelName)
        ? form.txChannelName
        : txChannels.length > 0
          ? txChannels[0].name
          : "";

    const refreshPending = dante.pendingCount("refresh") > 0;
    const routePending = dante.pendingCount("route") > 0;
    const unroutePending = dante.pendingCount("unroute") > 0;
    const clearPending = dante.pendingCount("clearRoutes") > 0;
    const busy = refreshPending || routePending || unroutePending || clearPending;

    function deviceName(serverName: string): string {
      return devices[serverName]?.name ?? serverName;
    }

    async function refreshAfter() {
      await dante.api.refresh();
    }

    async function routeCell(
      txServer: string,
      txChannelName: string,
      rxServer: string,
      rxChannel: number,
    ) {
      await dante.api.route(rxServer, rxChannel, txServer, txChannelName);
      await refreshAfter();
    }

    async function unrouteCell(rxServer: string, rxChannel: number) {
      await dante.api.unroute(rxServer, rxChannel);
      await refreshAfter();
    }

    return (
      <section mix={layoutStyle}>
        <section mix={panelStyle}>
          <div mix={toolbarStyle}>
            <div>
              <h2 mix={titleStyle}>Dante Router</h2>
              <p mix={mutedStyle}>
                Scan: {state.scanStatus}
                {state.lastScanAt
                  ? ` · last ${new Date(state.lastScanAt).toLocaleTimeString()}`
                  : ""}
                {deviceList.length > 0
                  ? ` · ${deviceList.length} device(s)`
                  : ""}
              </p>
            </div>
            <div mix={statusRowStyle}>
              <button
                type="button"
                disabled={refreshPending}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void dante.api.refresh();
                  }),
                ]}
              >
                {refreshPending ? "Scanning..." : "Refresh"}
              </button>
              <button
                type="button"
                disabled={dante.pendingCount("setLiveMdns") > 0}
                mix={[
                  buttonStyle,
                  on("click", () => {
                    void dante.api.setLiveMdns(!state.liveMdns);
                  }),
                ]}
                style={{
                  background: state.liveMdns ? "#fff" : undefined,
                  color: state.liveMdns ? "#000" : undefined,
                }}
              >
                {state.liveMdns ? "Live mDNS: On" : "Live mDNS: Off"}
              </button>
            </div>
          </div>
          {lastError && (
            <p mix={errorBannerStyle} role="alert">
              {lastError}
            </p>
          )}
        </section>

        <div mix={columnsStyle}>
          <section mix={panelStyle}>
            <div mix={toolbarStyle}>
              <h2 mix={titleStyle}>Devices ({deviceList.length})</h2>
            </div>
            {deviceList.length === 0 ? (
              <p mix={mutedStyle}>
                No devices discovered. Click Refresh to scan the network.
              </p>
            ) : (
              <ul mix={deviceListStyle}>
                {deviceList.map((d) => {
                  const rate = d.sampleRate
                    ? ` · ${(d.sampleRate / 1000).toFixed(0)}kHz`
                    : "";
                  return (
                    <li key={d.serverName} mix={deviceItemStyle}>
                      <div mix={deviceMetaStyle}>
                        <strong>{d.name}</strong>
                        <div mix={mutedStyle}>
                          {d.serverName} @ {d.ipv4}:{d.arcPort}
                          {rate}
                        </div>
                        <div mix={channelLineStyle}>
                          <span mix={channelTagStyle}>TX {d.txCount}</span>
                          <span mix={channelNamesStyle}>
                            {formatChannels(d.txChannels)}
                          </span>
                        </div>
                        <div mix={channelLineStyle}>
                          <span mix={channelTagStyle}>RX {d.rxCount}</span>
                          <span mix={channelNamesStyle}>
                            {formatChannels(d.rxChannels)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={clearPending}
                        mix={[
                          buttonStyle,
                          on("click", async () => {
                            await dante.api.clearRoutes(d.serverName);
                            await refreshAfter();
                          }),
                        ]}
                      >
                        {clearPending ? "Clearing..." : "Clear routes"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section mix={panelStyle}>
            <div mix={toolbarStyle}>
              <h2 mix={titleStyle}>Matrix</h2>
            </div>
            {matrixEntries.length === 0 ? (
              <p mix={mutedStyle}>(no routes)</p>
            ) : (
              <ul mix={matrixListStyle}>
                {matrixEntries.map(([rxServer, routes]) => {
                  const rxLabel = deviceName(rxServer);
                  return Object.entries(routes).map(([ch, route]) => {
                    const rxCh = Number(ch);
                    const txLabel = deviceName(route.txDevice);
                    return (
                      <li key={`${rxServer}:${ch}`} mix={matrixItemStyle}>
                        <span>
                          <strong>
                            {rxLabel}:{rxCh}
                          </strong>
                          {" ← "}
                          {txLabel}:{route.txChannelName}
                        </span>
                        <button
                          type="button"
                          disabled={unroutePending}
                          mix={[
                            buttonStyle,
                            on("click", async () => {
                              await dante.api.unroute(rxServer, rxCh);
                              await refreshAfter();
                            }),
                          ]}
                        >
                          {unroutePending ? "..." : "Unroute"}
                        </button>
                      </li>
                    );
                  });
                })}
              </ul>
            )}
          </section>
        </div>

        <section mix={panelStyle}>
          <div mix={toolbarStyle}>
            <h2 mix={titleStyle}>Route</h2>
            <p mix={mutedStyle}>
              Route a TX channel to an RX channel. Picks are populated from
              each device's discovered channels.
            </p>
          </div>
          <div mix={fieldGridStyle}>
            <label mix={fieldStyle}>
              <span>RX device</span>
              <select
                value={rxDevice}
                mix={[
                  inputStyle,
                  on("change", (event) => {
                    form = { ...form, rxDevice: event.currentTarget.value };
                    handle.update();
                  }),
                ]}
              >
                {deviceList.length === 0 ? (
                  <option value="">No devices</option>
                ) : (
                  deviceList.map((d) => (
                    <option key={d.serverName} value={d.serverName}>
                      {d.name} ({d.serverName})
                    </option>
                  ))
                )}
              </select>
            </label>
            <label mix={fieldStyle}>
              <span>RX channel</span>
              <select
                value={String(rxChannel)}
                disabled={rxChannels.length === 0}
                mix={[
                  inputStyle,
                  on("change", (event) => {
                    const n = Number.parseInt(
                      event.currentTarget.value,
                      10,
                    );
                    form = {
                      ...form,
                      rxChannel: Number.isFinite(n) ? n : 0,
                    };
                    handle.update();
                  }),
                ]}
              >
                {rxChannels.length === 0 ? (
                  <option value="">No RX channels</option>
                ) : (
                  rxChannels.map((c) => (
                    <option key={c.number} value={String(c.number)}>
                      {c.number}: {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label mix={fieldStyle}>
              <span>TX device</span>
              <select
                value={txDevice}
                mix={[
                  inputStyle,
                  on("change", (event) => {
                    form = { ...form, txDevice: event.currentTarget.value };
                    handle.update();
                  }),
                ]}
              >
                {deviceList.length === 0 ? (
                  <option value="">No devices</option>
                ) : (
                  deviceList.map((d) => (
                    <option key={d.serverName} value={d.serverName}>
                      {d.name} ({d.serverName})
                    </option>
                  ))
                )}
              </select>
            </label>
            <label mix={fieldStyle}>
              <span>TX channel</span>
              <select
                value={txChannelName}
                disabled={txChannels.length === 0}
                mix={[
                  inputStyle,
                  on("change", (event) => {
                    form = {
                      ...form,
                      txChannelName: event.currentTarget.value,
                    };
                    handle.update();
                  }),
                ]}
              >
                {txChannels.length === 0 ? (
                  <option value="">No TX channels</option>
                ) : (
                  txChannels.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.friendlyName ? `${c.friendlyName} (${c.name})` : c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          <div mix={buttonRowStyle}>
            <button
              type="button"
              disabled={
                busy ||
                !rxDevice ||
                !txDevice ||
                rxChannels.length === 0 ||
                txChannels.length === 0
              }
              mix={[
                buttonStyle,
                on("click", async () => {
                  await dante.api.route(
                    rxDevice,
                    rxChannel,
                    txDevice,
                    txChannelName,
                  );
                  await refreshAfter();
                }),
              ]}
            >
              {routePending ? "Routing..." : "Route"}
            </button>
          </div>
        </section>

        <DanteMatrix
          devices={devices}
          matrix={matrix}
          routePending={routePending}
          unroutePending={unroutePending}
          onRoute={routeCell}
          onUnroute={unrouteCell}
        />
      </section>
    );
  };
}

function formatChannels(channels: Map<number, DanteChannel>): string {
  const entries = [...channels.values()];
  if (entries.length === 0) return "(none)";
  return entries
    .map((c) => c.friendlyName ?? c.name)
    .join(", ");
}

const layoutStyle = css({
  display: "grid",
  gap: "16px",
});
const columnsStyle = css({
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  alignItems: "start",
  "@media (max-width: 900px)": {
    gridTemplateColumns: "1fr",
  },
});
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
const errorBannerStyle = css({
  margin: "8px 0 0",
  padding: "8px 12px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: "13px",
});
const statusRowStyle = css({
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
});
const deviceListStyle = css({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
});
const deviceItemStyle = css({
  display: "flex",
  gap: "10px",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid #e0e0e0",
  padding: "10px",
});
const deviceMetaStyle = css({ display: "grid", gap: "2px" });
const channelLineStyle = css({
  display: "flex",
  gap: "6px",
  alignItems: "baseline",
  fontSize: "12px",
});
const channelTagStyle = css({
  color: "#94a3b8",
  fontVariantNumeric: "tabular-nums",
  minWidth: "3.5em",
});
const channelNamesStyle = css({
  color: "#475569",
  wordBreak: "break-word",
});
const matrixListStyle = css({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "6px",
});
const matrixItemStyle = css({
  display: "flex",
  gap: "10px",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid #e0e0e0",
  padding: "8px 10px",
  fontSize: "13px",
});
const fieldGridStyle = css({
  display: "grid",
  gap: "10px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  "@media (max-width: 700px)": {
    gridTemplateColumns: "1fr",
  },
});
const fieldStyle = css({ display: "grid", gap: "4px", fontSize: "12px" });
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

type MatrixOrientation = "tx-rows" | "rx-rows";

type AxisEntry = {
  serverName: string;
  deviceName: string;
  channel: DanteChannel;
  kind: "tx" | "rx";
};

type AxisGroup = {
  serverName: string;
  deviceName: string;
  channels: DanteChannel[];
  kind: "tx" | "rx";
};

interface DanteMatrixProps {
  devices: Record<string, DanteDeviceRecord>;
  matrix: DanteRouterMatrix;
  routePending: boolean;
  unroutePending: boolean;
  onRoute: (
    txServer: string,
    txChannelName: string,
    rxServer: string,
    rxChannel: number,
  ) => void;
  onUnroute: (rxServer: string, rxChannel: number) => void;
}

export function DanteMatrix(handle: Handle<DanteMatrixProps>) {
  let orientation: MatrixOrientation = "tx-rows";

  return () => {
    const {
      devices,
      matrix,
      routePending,
      unroutePending,
      onRoute,
      onUnroute,
    } = handle.props;
    const deviceList = Object.values(devices).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );

    type ActiveRoute = { txDevice: string; txChannelName: string };
    const activeRouteByRx = new Map<string, ActiveRoute>();
    for (const [rxServer, routes] of Object.entries(matrix)) {
      for (const [ch, route] of Object.entries(routes)) {
        const rxCh = Number(ch);
        activeRouteByRx.set(`${rxServer}:${rxCh}`, {
          txDevice: route.txDevice,
          txChannelName: route.txChannelName,
        });
      }
    }

    function buildAxis(kind: "tx" | "rx"): AxisGroup[] {
      const groups: AxisGroup[] = [];
      for (const d of deviceList) {
        const map = kind === "tx" ? d.txChannels : d.rxChannels;
        const channels = [...map.values()].sort((a, b) => a.number - b.number);
        if (channels.length === 0) continue;
        groups.push({
          serverName: d.serverName,
          deviceName: d.name,
          channels,
          kind,
        });
      }
      return groups;
    }

    const txGroups = buildAxis("tx");
    const rxGroups = buildAxis("rx");
    const rowKind: "tx" | "rx" = orientation === "tx-rows" ? "tx" : "rx";
    const colKind: "tx" | "rx" = rowKind === "tx" ? "rx" : "tx";
    const rowGroups = rowKind === "tx" ? txGroups : rxGroups;
    const colGroups = colKind === "tx" ? txGroups : rxGroups;
    const colFlat: AxisEntry[] = colGroups.flatMap((g) =>
      g.channels.map((c) => ({
        serverName: g.serverName,
        deviceName: g.deviceName,
        channel: c,
        kind: colKind,
      })),
    );

    const numCols = colFlat.length;
    const hasContent =
      numCols > 0 && rowGroups.some((g) => g.channels.length > 0);
    const cellDisabled = routePending || unroutePending;

    function resolveTxRx(
      rowEntry: AxisEntry,
      colEntry: AxisEntry,
    ): { tx: AxisEntry; rx: AxisEntry } {
      return rowEntry.kind === "tx"
        ? { tx: rowEntry, rx: colEntry }
        : { tx: colEntry, rx: rowEntry };
    }

    function cellStateFor(tx: AxisEntry, rx: AxisEntry): CellState {
      const rxKey = `${rx.serverName}:${rx.channel.number}`;
      const active = activeRouteByRx.get(rxKey);
      if (!active) return "empty";
      if (
        active.txDevice === tx.deviceName &&
        active.txChannelName === tx.channel.name
      ) {
        return "active";
      }
      return "conflict";
    }

    return (
      <section mix={panelStyle}>
        <div mix={toolbarStyle}>
          <div>
            <h2 mix={titleStyle}>Routing Matrix</h2>
            <p mix={mutedStyle}>
              {orientation === "tx-rows"
                ? "Rows: transmitters · Columns: receivers"
                : "Rows: receivers · Columns: transmitters"}
              . Click a cell to toggle the route.
            </p>
          </div>
          <div mix={matrixControlsStyle}>
            <span mix={legendItemStyle}>
              <span mix={legendSwatchStyle("#16a34a")} /> routed
            </span>
            <span mix={legendItemStyle}>
              <span mix={legendSwatchStyle("#e2e8f0")} /> RX taken
            </span>
            <span mix={legendItemStyle}>
              <span mix={legendSwatchStyle("#fff")} /> available
            </span>
            <button
              type="button"
              mix={[
                buttonStyle,
                on("click", () => {
                  orientation =
                    orientation === "tx-rows" ? "rx-rows" : "tx-rows";
                  handle.update();
                }),
              ]}
            >
              Flip axes
            </button>
          </div>
        </div>

        {!hasContent ? (
          <p mix={mutedStyle}>
            No routable channels yet. Refresh and ensure devices report TX and
            RX channels.
          </p>
        ) : (
          <div mix={matrixScrollStyle}>
            <div
              mix={matrixGridStyle}
              style={{
                gridTemplateColumns: `160px repeat(${numCols}, minmax(26px, 30px))`,
              }}
            >
              <div mix={matrixCornerStyle}>
                {orientation === "tx-rows" ? "TX \\ RX" : "RX \\ TX"}
              </div>

              {colFlat.map((c, i) => (
                <div
                  mix={matrixColHeaderStyle}
                  key={`col-${c.serverName}-${c.channel.number}-${i}`}
                  title={`${c.deviceName} (${c.serverName}) ${c.channel.name}`}
                >
                  <span mix={colHeaderDeviceStyle}>{c.deviceName}</span>
                  <span>{c.channel.name}</span>
                </div>
              ))}

              {rowGroups.map((g) => (
                <Fragment key={`grp-${g.serverName}`}>
                  <div
                    mix={matrixRowGroupStyle}
                    style={{ gridColumn: `1 / span ${numCols + 1}` }}
                  >
                    {g.deviceName} ({g.serverName})
                  </div>
                  {g.channels.map((c) => {
                    const rowEntry: AxisEntry = {
                      serverName: g.serverName,
                      deviceName: g.deviceName,
                      channel: c,
                      kind: rowKind,
                    };
                    return (
                      <Fragment key={`row-${g.serverName}-${c.number}`}>
                        <div
                          mix={matrixRowLabelStyle}
                          title={`${g.deviceName} (${g.serverName}) ${c.name}`}
                        >
                          <span mix={rowLabelDeviceStyle}>
                            {g.deviceName}
                          </span>
                          <span>{c.name}</span>
                        </div>
                        {colFlat.map((colEntry, ci) => {
                          const { tx, rx } = resolveTxRx(rowEntry, colEntry);
                          const state = cellStateFor(tx, rx);
                          return (
                            <button
                              type="button"
                              disabled={cellDisabled}
                              mix={[
                                matrixCellStyle,
                                state === "active"
                                  ? cellActiveStyle
                                  : state === "conflict"
                                    ? cellConflictStyle
                                    : cellEmptyStyle,
                                on("click", () => {
                                  if (state === "active") {
                                    onUnroute(
                                      rx.serverName,
                                      rx.channel.number,
                                    );
                                  } else {
                                    onRoute(
                                      tx.serverName,
                                      tx.channel.name,
                                      rx.serverName,
                                      rx.channel.number,
                                    );
                                  }
                                }),
                              ]}
                              key={`cell-${g.serverName}-${c.number}-${ci}`}
                              aria-label={`${state === "active" ? "Unroute" : "Route"} ${tx.deviceName} ${tx.channel.name} → ${rx.deviceName} ${rx.channel.number}`}
                              title={`${tx.deviceName} ${tx.channel.name} → ${rx.deviceName} ${rx.channel.name}`}
                            >
                              {state === "active"
                                ? "●"
                                : state === "conflict"
                                  ? "◦"
                                  : ""}
                            </button>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };
}

type CellState = "active" | "conflict" | "empty";

const matrixControlsStyle = css({
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
});
const legendItemStyle = css({
  display: "inline-flex",
  gap: "5px",
  alignItems: "center",
  fontSize: "12px",
  color: "#475569",
});
const legendSwatchStyle = (color: string) =>
  css({
    display: "inline-block",
    width: "12px",
    height: "12px",
    background: color,
    border: "1px solid #c0c0c0",
  });
const matrixScrollStyle = css({
  overflow: "auto",
  maxHeight: "70vh",
  border: "1px solid #d4d4d4",
  background: "#e8e8e8",
});
const matrixGridStyle = css({
  display: "grid",
  gap: "1px",
  background: "#e2e8f0",
  width: "max-content",
  minWidth: "100%",
});
const matrixCornerStyle = css({
  position: "sticky",
  top: "0",
  left: "0",
  zIndex: "3",
  background: "#f1f5f9",
  padding: "6px 8px",
  fontSize: "11px",
  color: "#64748b",
  display: "flex",
  alignItems: "center",
});
const matrixColHeaderStyle = css({
  position: "sticky",
  top: "0",
  zIndex: "2",
  background: "#f1f5f9",
  writingMode: "vertical-rl",
  padding: "6px 2px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  fontSize: "11px",
  minHeight: "80px",
});
const colHeaderDeviceStyle = css({
  color: "#94a3b8",
  fontSize: "10px",
  marginBottom: "2px",
});
const matrixRowGroupStyle = css({
  background: "#e2e8f0",
  color: "#334155",
  fontSize: "11px",
  fontWeight: "600",
  padding: "4px 8px",
});
const matrixRowLabelStyle = css({
  position: "sticky",
  left: "0",
  zIndex: "1",
  background: "#f1f5f9",
  padding: "4px 8px",
  display: "flex",
  flexDirection: "column",
  fontSize: "11px",
  lineHeight: 1.2,
  minWidth: "0",
});
const rowLabelDeviceStyle = css({
  color: "#94a3b8",
  fontSize: "10px",
});
const matrixCellStyle = css({
  appearance: "none",
  border: "none",
  padding: "0",
  minWidth: "26px",
  height: "26px",
  fontSize: "14px",
  lineHeight: "1",
  cursor: "pointer",
  font: "inherit",
  "&:disabled": { cursor: "not-allowed" },
});
const cellActiveStyle = css({
  background: "#16a34a",
  color: "#fff",
});
const cellConflictStyle = css({
  background: "#e2e8f0",
  color: "#94a3b8",
});
const cellEmptyStyle = css({
  background: "#fff",
});
