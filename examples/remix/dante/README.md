# Dante Router Example

A Remix frontend for `@nat-av/driver-dante-router`. The server runs one
`DanteRouter` driver and shares its state with the browser over WebSocket RPC.
The page shows a crosspoint matrix with receivers as rows and transmitters as
columns. Click a cell to subscribe that RX channel to the TX channel, and click
a routed cell to remove the subscription. Each RX channel takes one source, so
routing a new source replaces the old one.

## Running

Build the workspace packages first (`pnpm run build` at the workspace root),
then from this directory run `pnpm dev` and open http://localhost:44100.

## Configuration

Configuration lives in `server/natav.ts`. Out of the box the driver gets
`simulate: simulatedDevices`: it routes between the virtual devices defined in
`server/simulated-devices.ts`, so the page works without Dante hardware.

To control a real Dante network, remove `simulate`. The driver then discovers
devices with mDNS by shelling out to `avahi-browse`, so avahi must be installed
and running. Other constructor options:

- `interfaceIp` binds ARC traffic to one interface on hosts with more than one
  network.
- `liveMdns: true` starts with live mDNS on, which rescans when devices join or
  leave. The page can toggle it.
- `discovery: new StaticDiscovery([{ ipv4: "10.0.0.20" }])` skips mDNS and
  queries fixed addresses. The port defaults to 4440 (ARC).

Discovery only returns devices that avahi can resolve to an address. If
`avahi-browse -rt _netaudio-arc._udp` lists devices but reports "Failed to
resolve", use `StaticDiscovery`. This is common when the devices sit on another
subnet behind an mDNS reflector, and it also means the host needs a route to
that subnet for ARC requests to reach the devices.

## Layout

- `server.ts` serves HTTP and starts Natav.
- `server/natav.ts` configures the driver and the RPC server.
- `server/simulated-devices.ts` defines the virtual devices for `simulate`.
- `app/ui/app.tsx` holds the header, rescan and live mDNS controls, and errors.
- `app/ui/matrix.tsx` renders the routing matrix.
- `app/ui/devices.tsx` renders the device inventory.
