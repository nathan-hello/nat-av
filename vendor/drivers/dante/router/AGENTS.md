# Dante Router Agent Guide

## Purpose

`DanteRouter` is a matrix router for Dante audio devices. Dante uses multicast
for audio transport and mDNS for device discovery. This driver discovers Dante
devices on the local network, inventories their TX/RX channels, reads current
subscription state, and lets you route any TX channel on any device to any RX
channel on any other device. It does not decode audio, encode audio, or
participate in audio multicast groups.

## Scope — what this driver does

- Discover Dante devices via mDNS (system `avahi-browse`), returning IP and
  ARC port for each device.
- Query each device over unicast UDP on its ARC port for device name, channel
  counts, TX channel names (raw and friendly), and RX channel subscription
  state.
- Build a readable matrix snapshot: `{ rxServerName: { rxChannelNumber: { txDevice, txChannelName } } }`.
- Add and remove subscriptions (the Dante term for "route").
- Support bulk subscription add (up to 16 per packet) and bulk remove.
- Support live mDNS watching with a constructor param and API toggle.
- Bind unicast transport to a specific interface when `interfaceIp` is
  provided.

## Scope — what this driver does NOT do

- Audio multicast group management, audio encode/decode, or audio transport.
- Device configuration: sample rate, latency, AES67, naming, reboot, lock,
  metering, gain, Bluetooth status, encoding, DHCP, or firmware.
- Flow management (TX flow creation/deletion/query).
- Notification listening (control monitoring events).
- Heartbeat or device health tracking.
- Schema generation (returns an empty schema pending implementation).

## File map

- `types.ts` — Shared data model interfaces. `DanteDeviceRecord`,
  `DanteChannel`, `DanteSubscription`, `RouteEntry`, `DanteRouterState`,
  `DanteRouterMatrix`, `DiscoveredService`, `DiscoveryEvent`,
  `DiscoveryBackend`.

- `constants.ts` — Protocol constants lifted from the Python reference at
  `/opt/network-audio-controller`. Includes the ARC protocol ID (`0x27FF`),
  opcodes (`OPCODE_DEVICE_NAME`, `OPCODE_SUBSCRIPTION_ADD`, etc.), service
  types (`_netaudio-arc._udp.local.`), record sizes, and page constants.

- `packets.ts` — Builder functions for binary ARC protocol packets. Every
  function returns a `Buffer` ready to send over UDP. Covers device name
  query, channel count query, RX channels query, TX channels query (friendly
  and raw), bulk subscription add (1–16 entries), and bulk subscription
  remove. Subscription add string offsets are absolute into the full ARC
  packet (header + payload), matching the Python `DanteDeviceCommands` class
  where `packet_header_size = 8` accounts for the ARC header.

- `parser.ts` — Binary response parsers. `getDeviceName`, `getChannelCount`,
  `getResultCode`, `parseRxChannels`, `parseTxFriendlyNames`,
  `parseTxChannelInfo`. Parsing matches the Python `DanteDeviceParser` class,
  including page-aware iteration with expected channel numbers. Sample rate
  is extracted from both RX channel responses (first record only when
  subscribed) and TX channel info responses (first record's channel group).

- `multicast.ts` — Standalone, reusable multicast UDP transport. Not tied to
  Dante or mDNS. Binds to a port, joins multicast groups, receives messages
  via callback, sends to specific group addresses. Accepts optional
  `interfaceIp` for interface binding.

- `discovery.ts` — Device discovery backend. The `DiscoveryBackend` interface
  defines `discover()` and optional `watch()`. `AvahiDiscovery` shells out to
  system `avahi-browse -rtp` for one-shot scans and `avahi-browse -rp` for
  live watching. Output is parsed into `DiscoveredService` records with name,
  IP, port, and TXT properties. The `avahiServiceType()` helper strips the
  `.local.` suffix from service types before passing them to `avahi-browse`,
  which rejects the full DNS-SD service type format.

- `index.ts` — Main `DanteRouter extends Driver<"dante">` class. Owns an
  internal `ArcTransport` for unicast ARC protocol requests with
  transaction-ID matching and per-request timeouts. Constructor accepts
  `name`, `liveMdns`, and `interfaceIp`. Exposes the API: `refresh`,
  `getDevices`, `getDevice`, `getMatrix`, `route`, `unroute`, `clearRoutes`,
  `setLiveMdns`. The matrix is built exclusively by `refresh()` from real
  device subscription data; `route`/`unroute`/`clearRoutes` send ARC
  commands and validate the result code but do not mutate the matrix.
  Emits `driver:state-updated` on scan progress and matrix rebuilds.
  `socket` is set to `undefined` because transport is managed internally.

- `scripts/index.ts` — Interactive CLI shell for live Dante routing. Runs
  with `npx tsx ./vendor/drivers/dante/router/scripts/index.ts [interface-ip]`.
  Supports commands: `list`, `matrix`, `route`, `unroute`, `clear`, `refresh`,
  `help`, `exit`. Resolves device names case-insensitively with partial
  matching. Auto-refreshes the matrix after each route/unroute/clear operation.

## Dependencies

Zero npm dependencies. Transport uses `node:dgram`. Discovery uses
`child_process` to call `avahi-browse` (available on Void Linux with avahi
installed). If `avahi-browse` is not available, discovery returns an empty
list gracefully.
