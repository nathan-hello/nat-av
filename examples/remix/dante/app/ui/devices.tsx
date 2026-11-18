import type {
  DanteDeviceRecord,
  DanteRouterMatrix,
} from "@nat-av/driver-dante-router";
import { css, type Handle } from "remix/ui";
import { colors, muted, panel } from "@/ui/styles";

interface DeviceListProps {
  devices: DanteDeviceRecord[];
  matrix: DanteRouterMatrix;
}

export function DeviceList(handle: Handle<DeviceListProps>) {
  return () => {
    const { devices, matrix } = handle.props;

    return (
      <section mix={panel}>
        <h2 mix={heading}>Devices</h2>
        {devices.length === 0 ?
          <p mix={muted}>
            Nothing discovered. Check that this machine can reach the Dante
            network, or set DANTE_DEVICES to the device addresses.
          </p>
        : <table mix={table}>
            <thead>
              <tr>
                <th mix={cell}>Name</th>
                <th mix={cell}>Address</th>
                <th mix={[cell, numeric]}>TX</th>
                <th mix={[cell, numeric]}>RX</th>
                <th mix={[cell, numeric]}>Routed RX</th>
                <th mix={[cell, numeric]}>Sample rate</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.serverName}>
                  <td mix={cell}>
                    <strong>{device.name}</strong>
                    {device.serverName !== device.name && (
                      <div mix={muted}>{device.serverName}</div>
                    )}
                  </td>
                  <td mix={[cell, mono]}>
                    {device.ipv4}:{device.arcPort}
                  </td>
                  <td mix={[cell, numeric]}>{device.txCount}</td>
                  <td mix={[cell, numeric]}>{device.rxCount}</td>
                  <td mix={[cell, numeric]}>
                    {Object.keys(matrix[device.serverName] ?? {}).length}
                  </td>
                  <td mix={[cell, numeric]}>
                    {device.sampleRate ?
                      `${(device.sampleRate / 1000).toFixed(1)} kHz`
                    : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </section>
    );
  };
}

const heading = css({ margin: "0 0 10px", fontSize: "15px" });
const table = css({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
});
const cell = css({
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: `1px solid ${colors.grid}`,
});
const numeric = css({
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
});
const mono = css({ fontFamily: "ui-monospace, monospace" });
