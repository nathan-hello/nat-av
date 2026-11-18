# Crestron DM NVX

HTTPS driver for Crestron DM NVX endpoints. `NvxDriver` exposes routing, USB, EDID, preview, subscriptions, NAX audio, multiview, Dante and administration APIs, gated by model profile and device discovery (below). `Nvx363Driver` remains an alias. `capabilities()` reads native device capabilities; `controls(object)` returns catalog controls whose paths appear in this firmware’s response. Write-only triggers need not appear in this list.

## Interactive shell

From the workspace root, run:

```sh
pnpm --filter @nat-av/driver-crestron-nvx... run build
pnpm --filter @nat-av/driver-crestron-nvx run repl 10.1.0.201
```

Once the HTTPS login page responds, the shell prompts for your username and password. Password input is hidden. For noninteractive use with piped commands, set `NVX_USERNAME` and `NVX_PASSWORD` instead. The REPL accepts self-signed certificates by default; use `--verify-tls` to require a trusted certificate.

Start with `info`, `discover`, `caps`, `controls DeviceSpecific`, and `streams`. `streams` reads the device’s `NaxAudio` object, including the SDP sessions it sees and its own RX/TX streams. `objects` lists the driver catalog, not a promise that this model implements every object.

For example, if `streams` reports an RX slot named `Stream01` and the desired source advertises `239.69.100.200:5004`, configure that receiver:

```text
control nax-rx-mode Manual
nax Rx Stream01 address 239.69.100.200
nax Rx Stream01 port 5004
nax Rx Stream01 start
streams
```

Use the actual stream key, address and port from the device. `start` requests reception; check `StreamStatus` and the output audio source before expecting audio at the connector. AES67 addresses are multicast groups, not the NVX management IP. For a transmitter use `Tx` and `nax-tx-mode`. `exit` logs out.

## Model profiles and discovery

What an NVX can do is decided in two steps.

1. **Model profile (Crestron SDK XML).** `pnpm run setup` restores the pinned
   [Crestron NuGet SDK](https://www.nuget.org/packages/Crestron.SimplSharp.SDK.ProgramLibrary/2.21.274)
   into the ignored `sdk/packages/` directory, and `scripts/generate.py` reads its
   compiler XML (`SimplSharpPro.xml`, `Crestron.SimplSharpPro.DM.xml`) into the
   committed `client/generated.ts`. For every documented DM-NVX-3xx model it records
   the SDK families (`DmNvx36x`, `DmNvx38x`, `DmNvx38xDsp`, ...), HDMI and USB-C
   input counts, `DeviceSpecific.AudioSource` values, Dante support, and
   `features`: the SDK members whose support differs between models, decided by
   each member's "not supported by" / "supported only for" statements. For
   example the 384 lists `MultiviewControlsSetup` and `UsbcIn`, and the 360 lists
   `PreviewImage` and `TestPatternGenerator`. The generator never uses the network.
2. **Device discovery.** After `api.connect()`, `api.discover()` reads
   `DeviceInfo`, matches `Model` to its profile, then GETs every other catalog
   object. The result (`state.discovery`) lists the objects the device reported,
   the ones it did not, its port counts (`DeviceCapabilities.PortConfig`), and
   the controls whose paths it reported. Values are narrowed to the model and
   device: audio sources by profile, `InputN` values by input count, and
   multiview layouts by the device's `MultiViewLayoutsSupported`.

Some REST objects depend on a model feature, because NVX firmware is shared
across families and may answer for hardware the model lacks:

| Object              | Shown only when the profile has     |
| ------------------- | ----------------------------------- |
| `Dante`             | Dante (352/352C, 363/363C)          |
| `MultiViewLayout`   | `MultiviewControlsSetup` (38x)      |
| `Preview`           | `PreviewImage` (360/360C, 363/363C) |
| `TestPatternConfig` | `TestPatternGenerator` (36x)        |

Discovery does not probe these objects on other models; they are listed in
`discovery.withheld`, and writes to them are refused. A model the SDK does not
document gets no profile, and everything it reports is shown. After discovery,
`control()` and `change()` accept only discovered controls. `change(id, value)`
validates a control against the device and returns the native patch without
writing it, for applications that review changes first.

```ts
await nvx.api.connect();
const found = await nvx.api.discover();
found.objects; // ["DeviceSpecific", "MultiViewLayout", ...] on a 384
found.controls.find((c) => c.id === "mv-layout")?.values; // the device's layouts
await nvx.api.control("mv-layout", "2x2");
```

`await forNvxModel(driver, "DM-NVX-360")` checks `DeviceInfo.Model` and returns
model-specific audio setters. TypeScript rejects `setAudioSource("Input2")` on a
360, and exposes `dante` only on the 352/363 families.

To move to a newer SDK, change the `Version` in `sdk/CrestronSdk.csproj` and run
`pnpm run setup` from the workspace root (requires the .NET SDK and Python 3).

On Dante-capable firmware, `controls Dante` reads Crestron's
[Dante port dictionary](https://sdkcon78221.crestron.com/sdk/DM_NVX_REST_API/Content/Topics/Objects/Dante.htm).
For example, if `dante.Port1.source` appears, `control dante.Port1.source Auto`
sets that port's source. `controls DeviceSpecific` similarly exposes `nax-source`
when present. These controls are discovered per object on demand and checked
again before writing. Option group names and versions are returned as metadata;
applications can supply verified choices as a fourth constructor argument
(`{ [groupName]: { [version]: ["Auto", ...] } }`). With no matching list,
source selection is validated by the endpoint.

```ts
import NvxDriver from "@nat-av/driver-crestron-nvx";

const nvx = new NvxDriver("receiver", {
  host,
  httpsPort: 443,
  username,
  password,
  allowSelfSigned: false,
});
await nvx.api.connect();
try {
  const snapshot = await nvx.api.refresh("NaxAudio");
  console.log(snapshot.objects.NaxAudio);
} finally {
  await nvx.api.disconnect();
}
```

The optional third constructor argument supplies a transport factory for testing or custom network access. Device-specific features depend on model, firmware and account permissions. See [Crestron’s NVX API reference](https://sdkcon78221.crestron.com/sdk/DM_NVX_REST_API/Content/Topics/API-Reference.htm).

## Client-safe code

`@nat-av/driver-crestron-nvx/client` exports the catalog, command builders,
model profiles and `nvxDiscovery()` from `client/*.ts` for browser use. They
import no Node or network code; the driver re-exports them from `.`.
