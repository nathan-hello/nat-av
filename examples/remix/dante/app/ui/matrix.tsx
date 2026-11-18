import type {
  DanteChannel,
  DanteDeviceRecord,
  DanteRouterMatrix,
} from "@nat-av/driver-dante-router";
import { Fragment, css, on, type Handle } from "remix/ui";
import { button, colors, muted, panel, smallButton } from "@/ui/styles";

export type Crosspoint = {
  key: string;
  rxServer: string;
  rxChannel: number;
  /** Dante device name of the transmitter, as used in subscriptions. */
  txDevice: string;
  txChannel: string;
  active: boolean;
};

interface MatrixProps {
  devices: DanteDeviceRecord[];
  matrix: DanteRouterMatrix;
  pendingKey: string | null;
  disabled: boolean;
  onToggle: (point: Crosspoint) => void;
  onClear: (rxServer: string) => void;
}

type Column = { device: DanteDeviceRecord; channel: DanteChannel };

/**
 * Crosspoint grid with receivers as rows and transmitters as columns. A Dante
 * RX channel takes exactly one source, so each row has at most one routed
 * cell; clicking another cell in the row replaces that subscription.
 */
export function Matrix(handle: Handle<MatrixProps>) {
  return () => {
    const { devices, matrix, pendingKey, disabled, onToggle, onClear } =
      handle.props;

    const transmitters = devices.filter((d) => d.txChannels.size > 0);
    const receivers = devices.filter((d) => d.rxChannels.size > 0);
    const columns: Column[] = transmitters.flatMap((device) =>
      sortedChannels(device.txChannels).map((channel) => ({ device, channel })),
    );
    const byName = new Map(devices.map((d) => [d.name, d]));

    if (columns.length === 0 || receivers.length === 0) {
      return (
        <section mix={panel}>
          <h2 mix={heading}>Routing matrix</h2>
          <p mix={muted}>
            {devices.length === 0 ?
              "No Dante devices found yet."
            : "Routing needs at least one device with TX channels and one with RX channels."
            }
          </p>
        </section>
      );
    }

    return (
      <section mix={[panel, css({ padding: 0, overflow: "hidden" })]}>
        <div mix={toolbar}>
          <h2 mix={heading}>Routing matrix</h2>
          <div mix={legend}>
            <span mix={legendItem}>
              <span mix={swatch(colors.routed)} /> routed
            </span>
            <span mix={legendItem}>
              <span mix={swatch(colors.unresolved)} /> source not found
            </span>
            <span mix={muted}>
              Click a cell to route, click again to unroute.
            </span>
          </div>
        </div>
        <div mix={scroller}>
          <table mix={table}>
            <thead>
              <tr>
                <th rowSpan={2} mix={[corner, stickyTop(0)]}>
                  <span mix={muted}>RX ↓ · TX →</span>
                </th>
                {transmitters.map((device) => (
                  <th
                    key={device.serverName}
                    colSpan={device.txChannels.size}
                    mix={[txGroupHeader, stickyTop(0)]}
                    title={`${device.name} · ${device.ipv4}`}
                  >
                    {device.name}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map(({ device, channel }, i) => (
                  <th
                    key={`${device.serverName}:${channel.number}`}
                    mix={[
                      txChannelHeader,
                      stickyTop(GROUP_HEADER_HEIGHT),
                      startsGroup(columns, i) ? groupEdge : null,
                    ]}
                    title={`${device.name} TX ${channel.number}: ${channel.name}${channel.friendlyName ? ` (${channel.friendlyName})` : ""}`}
                  >
                    <span mix={verticalText}>
                      {channel.friendlyName ?? channel.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receivers.map((rx) => {
                const routes = matrix[rx.serverName] ?? {};
                const routeCount = Object.keys(routes).length;
                const clearing = pendingKey === `clear:${rx.serverName}`;
                return (
                  <Fragment key={rx.serverName}>
                    <tr>
                      <th colSpan={columns.length + 1} mix={rxGroupRow}>
                        <div mix={rxGroupLabel}>
                          <strong>{rx.name}</strong>
                          <span mix={muted}>{rx.ipv4}</span>
                          <button
                            type="button"
                            disabled={disabled || routeCount === 0}
                            mix={[
                              button,
                              smallButton,
                              on("click", () => onClear(rx.serverName)),
                            ]}
                          >
                            {clearing ? "Clearing…" : `Clear ${routeCount}`}
                          </button>
                        </div>
                      </th>
                    </tr>
                    {sortedChannels(rx.rxChannels).map((rxChannel) => {
                      const route = routes[rxChannel.number];
                      const source = route && byName.get(route.txDevice);
                      const unresolved = route !== undefined && !source;
                      return (
                        <tr key={rxChannel.number}>
                          <th mix={rxLabel} scope="row">
                            <span mix={rxNumber}>{rxChannel.number}</span>
                            <span mix={rxName}>{rxChannel.name}</span>
                            <span
                              mix={[
                                rxSource,
                                unresolved ? unresolvedText : null,
                              ]}
                              title={
                                unresolved ?
                                  "Subscribed source is not among the discovered devices"
                                : undefined
                              }
                            >
                              {route ?
                                `← ${route.txDevice} ${source ? txLabel(source, route.txChannelName) : route.txChannelName}`
                              : ""}
                            </span>
                          </th>
                          {columns.map(({ device, channel }, i) => {
                            const active =
                              route?.txDevice === device.name &&
                              route.txChannelName === channel.name;
                            const point: Crosspoint = {
                              key: `${rx.serverName}:${rxChannel.number}:${device.name}:${channel.name}`,
                              rxServer: rx.serverName,
                              rxChannel: rxChannel.number,
                              txDevice: device.name,
                              txChannel: channel.name,
                              active,
                            };
                            const pending = pendingKey === point.key;
                            return (
                              <td
                                key={`${device.serverName}:${channel.number}`}
                                mix={[
                                  cellTd,
                                  startsGroup(columns, i) ? groupEdge : null,
                                ]}
                              >
                                <button
                                  type="button"
                                  disabled={disabled}
                                  aria-pressed={active ? "true" : "false"}
                                  aria-label={`${active ? "Unroute" : "Route"} ${device.name} ${channel.name} to ${rx.name} ${rxChannel.name}`}
                                  title={`${device.name} ${channel.friendlyName ?? channel.name} → ${rx.name} ${rxChannel.name}`}
                                  mix={[
                                    cell,
                                    active ? cellActive : null,
                                    pending ? cellPending : null,
                                    on("click", () => onToggle(point)),
                                  ]}
                                >
                                  {pending ? "…" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };
}

function sortedChannels(channels: Map<number, DanteChannel>): DanteChannel[] {
  return [...channels.values()].sort((a, b) => a.number - b.number);
}

function txLabel(device: DanteDeviceRecord, channelName: string): string {
  for (const channel of device.txChannels.values()) {
    if (channel.name === channelName)
      return channel.friendlyName ?? channel.name;
  }
  return channelName;
}

function startsGroup(columns: Column[], index: number): boolean {
  return index > 0 && columns[index - 1].device !== columns[index].device;
}

const GROUP_HEADER_HEIGHT = 30;
const CELL_SIZE = 28;

const heading = css({ margin: 0, fontSize: "15px" });
const toolbar = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "12px",
  padding: "14px 16px",
  borderBottom: `1px solid ${colors.border}`,
});
const legend = css({
  display: "flex",
  gap: "14px",
  alignItems: "center",
  flexWrap: "wrap",
  fontSize: "12px",
});
const legendItem = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
});
const swatch = (color: string) =>
  css({
    width: "12px",
    height: "12px",
    borderRadius: "3px",
    background: color,
  });
const scroller = css({ overflow: "auto", maxHeight: "75vh" });
const table = css({
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "12px",
});
const stickyTop = (top: number) =>
  css({ position: "sticky", top: `${top}px`, zIndex: 2 });
const corner = css({
  left: 0,
  zIndex: 3,
  background: colors.header,
  borderRight: `1px solid ${colors.border}`,
  borderBottom: `1px solid ${colors.border}`,
  padding: "6px 10px",
  textAlign: "left",
  verticalAlign: "bottom",
});
const txGroupHeader = css({
  height: `${GROUP_HEADER_HEIGHT}px`,
  background: colors.header,
  borderBottom: `1px solid ${colors.grid}`,
  borderLeft: `1px solid ${colors.border}`,
  padding: "0 6px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 0,
  textAlign: "left",
});
const txChannelHeader = css({
  background: colors.header,
  borderBottom: `1px solid ${colors.border}`,
  padding: "6px 0",
  fontWeight: 500,
  verticalAlign: "bottom",
});
const verticalText = css({
  writingMode: "vertical-rl",
  transform: "rotate(180deg)",
  whiteSpace: "nowrap",
  display: "inline-block",
  maxHeight: "110px",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
const groupEdge = css({ borderLeft: `1px solid ${colors.border}` });
const rxGroupRow = css({
  background: "#f3f4f6",
  borderBottom: `1px solid ${colors.grid}`,
  padding: 0,
  textAlign: "left",
});
const rxGroupLabel = css({
  position: "sticky",
  left: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "6px 10px",
});
const rxLabel = css({
  position: "sticky",
  left: 0,
  zIndex: 1,
  background: "#fff",
  borderRight: `1px solid ${colors.border}`,
  borderBottom: `1px solid ${colors.grid}`,
  padding: "0 10px",
  fontWeight: 400,
  textAlign: "left",
  whiteSpace: "nowrap",
  minWidth: "240px",
});
const rxNumber = css({
  display: "inline-block",
  width: "24px",
  color: colors.muted,
  fontVariantNumeric: "tabular-nums",
});
const rxName = css({ display: "inline-block", minWidth: "70px" });
const rxSource = css({ color: colors.muted, marginLeft: "8px" });
const unresolvedText = css({ color: colors.unresolved });
const cellTd = css({
  padding: 0,
  borderBottom: `1px solid ${colors.grid}`,
  borderRight: `1px solid ${colors.grid}`,
});
const cell = css({
  display: "block",
  width: `${CELL_SIZE}px`,
  height: `${CELL_SIZE}px`,
  border: "none",
  padding: 0,
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  "&:hover:not(:disabled)": { background: "#dbeafe" },
  "&:disabled": { cursor: "not-allowed" },
  "&:focus-visible": {
    outline: `2px solid ${colors.accent}`,
    outlineOffset: "-2px",
  },
});
const cellActive = css({
  background: colors.routed,
  "&:hover:not(:disabled)": { background: "#15803d" },
});
const cellPending = css({ background: "#93c5fd", color: "#1e3a8a" });
