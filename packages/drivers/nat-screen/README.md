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

Receiver configuration uses repeatable flags instead of JSON. Route IDs are
optional and default to `route1`, `route2`, and so on:

```text
apply -r 239.1.2.3:5000 -r 239.1.2.4:5000 --layout side-by-side
layout fullscreen route1
layout side-by-side
layout quad
clear
```

Use `id=address:port` to choose stable route names:

```text
apply -r main=239.1.2.3:5000 -r backup=239.1.2.4:5000
```

Sender configuration requires only an output. Camera and encoder settings use
the documented defaults and can be overridden with flags:

```text
apply -o 239.1.2.3:5000
apply -o 239.1.2.3:5000 -c /dev/video2 --size 1280x720 -f 60 --codec mjpeg
```

Run `help` in the REPL for every option and discovery command.
