# Crestron 4-Series control processor (CP4N)

Drivers for Crestron 4-Series control processors: CresNext HTTPS (`Cp4nDriver`)
and one-shot SSH/SFTP (`CrestronSsh`, `CrestronSshDriver`). The SSH side also
reaches endpoints behind the processor, such as touch panels and DM NVX, through
its port forwarding. Nothing here knows about rooms, settings files, firmware
campaigns or other application workflows.

## Lifecycle

- Construction and `start()` do no network I/O.
- `api.connect()` explicitly authenticates (`/userlogin.html`). Login requires
  the processor's `CREST-XSRF-TOKEN`; writes send it back.
- Requests are serialized per driver, bounded, redirect-free and use the
  supplied transport. There are no polls, timers, retries or reconnects.
- `api.disconnect()` attempts logout and always clears local cookies.
- An expired session requires another explicit `connect()`; an uncertain write
  is never replayed.

## API

```ts
import Cp4nDriver from "@nat-av/driver-crestron-cp4n";

const cp4n = new Cp4nDriver("processor-1", {
  host, httpsPort: 443, username, password, allowSelfSigned: false,
});
await cp4n.api.connect();
const programs = await cp4n.api.programs(); // { Device: { Programs: ... } }
const any = await cp4n.api.read("NetworkAdapters");
await cp4n.api.setRouter({ IsIsolationModeEnabled: false });
await cp4n.api.set("Router", { PortMap: { ... } });
await cp4n.api.disconnect();
```

Reads return the native `{ Device: { [object]: ... } }` response so callers
can validate the exact firmware shape. `set()` posts a nonempty partial object
to `/Device` (an empty object would delete the target) and requires every
`Actions[].Results[].StatusId` to be `0`.

The optional third constructor argument supplies a transport factory for
testing, forwarding or custom TLS. The default uses undici and honours
`allowSelfSigned`.

## SSH and SFTP

`CrestronSsh` performs one-shot operations: each call opens a connection, does
one thing and closes. It never opens a shell or PTY, never retries, and
`close()` cancels everything pending.

```ts
import { CrestronSsh, CrestronSshDriver } from "@nat-av/driver-crestron-cp4n";

const ssh = new CrestronSsh(); // { timeoutMs = 20_000, verifyHostKey = true }
const endpoint = { host, sshPort: 22, username, password, sshFingerprint };
endpoint.sshFingerprint = await ssh.fingerprint(endpoint); // after operator trust
const device = new CrestronSshDriver("processor-1", endpoint, ssh);
await device.api.connections(); // WHO Logic Connections: slot, IP ID, address
await device.api.version(); // ver -v: model, version, identity
await device.api.readFile("/user/settings.txt", 256 * 1024);
await device.api.uploadFirmware(localPath, "update.puf", "puf", onBytes);
await device.api.startFirmware("puf", { name: "update.puf", bytes });
```

- **Host keys.** `fingerprint()` reads the host key without sending credentials.
  With `verifyHostKey` (the default), every other call requires
  `sshFingerprint` to match, or fails before authenticating.
- **Authentication.** The password is sent at most once, by `password` or a
  single keyboard-interactive prompt that asks for it. Rejected credentials are
  never resent by another method, and password-change or OTP challenges are
  refused.
- **Commands.** Only fixed commands run: `who`, `ver -v`, and `puf all` (`.puf`)
  or `imgupd` (`.zip`). Output is size-bounded and parsed strictly.
- **SFTP reads.** Absolute paths only, at most 2 MiB, checked for truncation or
  modification during the read.
- **Firmware.** `uploadFirmware` refuses if `/firmware` already holds a package,
  writes a new file with acknowledged bounded writes and verifies its size.
  `startFirmware` re-checks that the staged file is the only package, then sends
  the install command once and treats the update's disconnect as expected. If
  the preflight fails it throws `FirmwareNotDispatchedError`; nothing was sent.

## Client-safe code

`@nat-av/driver-crestron-cp4n/client` exports the console parsers and validators
(`parseFirmwareIdentity`, `parseLogicConnections`, `validateFingerprint`,
`sameFirmwareVersion`, `firmwareCommand`, ...) without Node or ssh2 imports.
