# Crestron DM NVX

HTTPS driver ported from the config builder’s `crestron-drivers` package. `NvxDriver` exposes the original routing, USB, EDID, preview, subscriptions, NAX audio, and administration API. `Nvx363Driver` remains an alias. `capabilities()` reads native device capabilities; `controls(object)` returns catalog controls whose paths appear in this firmware’s response. Write-only triggers need not appear in this list.

## Interactive shell

From the workspace root, run:

```sh
pnpm --filter @nat-av/driver-crestron-nvx... run build
pnpm --filter @nat-av/driver-crestron-nvx run repl 10.1.0.201
```

Once the HTTPS login page responds, the shell prompts for your username and password. Password input is hidden. For noninteractive use with piped commands, set `NVX_USERNAME` and `NVX_PASSWORD` instead. The REPL accepts self-signed certificates by default; use `--verify-tls` to require a trusted certificate.

Start with `info`, `caps`, `controls DeviceSpecific`, and `streams`. `streams` reads the device’s `NaxAudio` object, including the SDP sessions it sees and its own RX/TX streams. `objects` lists the driver catalog, not a promise that this model implements every object.

For example, if `streams` reports an RX slot named `Stream01` and the desired source advertises `239.69.100.200:5004`, configure that receiver:

```text
control nax-rx-mode Manual
nax Rx Stream01 address 239.69.100.200
nax Rx Stream01 port 5004
nax Rx Stream01 start
streams
```

Use the actual stream key, address and port from the device. `start` requests reception; check `StreamStatus` and the output audio source before expecting audio at the connector. AES67 addresses are multicast groups, not the NVX management IP. For a transmitter use `Tx` and `nax-tx-mode`. `exit` logs out.

## Application use

After authentication, `await forNvxModel(driver, "DM-NVX-360")` checks
`DeviceInfo.Model` and returns model-specific audio setters. TypeScript rejects
`setAudioSource("Input2")` on a 360, and exposes `dante` only on the 352/363
families in the current profiles. Dante port keys and option groups are still
checked against the endpoint.

To regenerate the profiles (requires the .NET SDK and Python 3):

```sh
pnpm run postinstall   # workspace root, run manually; restores the SDK, then generates
```

The restore-only project `sdk/CrestronSdk.csproj` pins the
[Crestron NuGet SDK](https://www.nuget.org/packages/Crestron.SimplSharp.SDK.ProgramLibrary/2.21.274);
this package's `postinstall` script runs `dotnet restore` into the ignored
`sdk/packages/` directory, and the generator reads `SimplSharpPro.xml` and
`Crestron.SimplSharpPro.DM.xml` from there. To move to a newer SDK, change the `Version` in the csproj and regenerate.
The generated file is included so consumers need neither .NET nor the SDK.
The SDK describes C# members, not HTTPS paths. The generator uses reviewed REST
enum mappings and a [documented hardware capability map](https://docs.crestron.com/en-us/9062/Content/Topics/WorksWith/DM-NVX.htm)
alongside the SDK's model exclusions. Its profiles currently cover audio source
selection and Dante controls, not every NVX API or firmware version.

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
  host, httpsPort: 443, username, password, allowSelfSigned: false,
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
