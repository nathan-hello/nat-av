# Crestron 4-Series control processor (CP4N)

CresNext HTTPS driver for Crestron 4-Series control processors. It reads and
writes native CresNext objects and knows nothing about rooms, settings files or
application workflows.

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
