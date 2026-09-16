# Nat Screen Driver

This package controls the `multicast-sender` and `multicast-receiver` programs
from the screen project. The driver is handwritten; only protobuf message
types, descriptors, and binary codecs are generated.

```ts
import NatScreen from "@nat-av/driver-nat-screen";
import { Tcp } from "@nat-av/core";

const sender = new NatScreen({
  name: "sender",
  kind: "sender",
  socket: new Tcp({ addr: "127.0.0.1", port: 7000 }),
});
```

The driver tracks the latest device revision and supplies it to configuration
mutations. Protobuf `uint64` values exposed through driver state are decimal
strings so the state remains safe to send over JSON RPC.

## Regenerating protobuf code

`proto/media_control.proto` is copied from the screen repository.
After updating it, regenerate the checked-in TypeScript descriptors and types:

```sh
pnpm --filter @nat-av/driver-nat-screen generate
```

Consumers do not need Buf or `protoc` at runtime.

## Interactive REPL

After building the workspace, start a REPL with an address and port:

```sh
pnpm --filter @nat-av/driver-nat-screen run repl 127.0.0.1 7000
```

Port 7000 selects sender commands; other ports select receiver commands. For a
sender on a nonstandard port, call `runRepl` with `kind: "sender"`.
