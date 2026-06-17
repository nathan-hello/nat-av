# nat-av Library

Natav is a vendored library that is in the `vendor/av` directory.

Its primary goal is to provide a high quality programming environment for
communicating directly with other devices on a local area network. Programs
using this library are typically not connected to the internet and have a
single digit, constant number of clients connecting to the server. 

# Folders

## ./vendor/av/drivers/

The Driver is an abstract base class used mostly for typing any implementations.
Inheriters of Driver only require four things: a `name`, `driverName`, `api`,
and `state`. 

This is the simplest possible Driver

```typescript
import { Driver } from "@av/drivers";

export class Controller extends Driver<"ui"> {
  state = {};
  api = {};
  constructor() {
    super({ name: "ui", driverName: "controller" });
  }
}
```

`Manager` is repsonsible for collecting all of the drivers together, dispatching
events, and giving the appropiate API to `RpcServer` when requested, as well
as injecting context if a `Driver` requests it. 

A `Driver` can either be precreated and given to the constructor of `Manager`,
or `Manager` can be given a `(natav: Manager) => Driver` function that will
be called during the construction phase of `Manager`.

There may be multiple Drivers that take this "deferred" path. For this reason
it is important to *never use the Manager object during the constructor of the
Driver*. This is because the Manager might not have called the Driver you are
looking for, or otherwise set up the context for the system, during that
construction phase. If you want to run some startup code that requires the
`Manager` use `public override start(): Promise<void> | void` in the Driver.
This is after `Manager.Start()` is called, which means all drivers originally
given to `Manager` are correctly available and constructed. 

Alternatively, if a Driver extremely depends on another driver, you can simply
put it in the constructor.

```typescript
import { Driver } from "@av/drivers";

class Leaf<const N extends string> extends Driver<N> {
  state = { ready: true };
  api = {
    setOnline
  };

  constructor(name: N) {
    super({ name, driverName: "leaf" });
  }
}

class Parent<
  const N extends string,
  const D extends Record<string, Leaf<string>>,
> extends Driver<N, D> {
  state = { ready: true };
  api = {};

  constructor(name: N, deps: D) {
    super({ name, driverName: "parent" });
    this.deps.set(deps);
  }
}

const child = new Leaf("child-1");
const parent = new Parent("parent-1", { [child.name]: child });
const natav = new Manager({
  drivers: [parent] as const,
  deferred: [] as const,
});
```

Then you can access the dependency using either:

```typescript
const client = new RpcClient<(typeof graph)["configs"]>({
  transport: transport,
});
client.device("parent-1").deps.get("child-1").name  // "child-1"
client.device("parent-1").deps.get("child-1").state // { online: true }
```

Or you can query the `child-1` directly. Dependencies are lifted up to a single
flat array in Manager. This so it is more obvious what names are available and
accessing the drivers easier.

```typescript
client.device("child-1").state // { online: true }
client.device("child-1").name  // "child-1"
```

## av/lib/eventtarget.ts

This is a typed event target wrapper that just means that when we dispatch or
listen to events, it is type safe and reliable.

## av/rpc/

This is the RPC layer. We use a Proxy object on client to instead of actually
calling a Driver implementation, we serialize the request into a JSONRPC
request that gets sent to the server, and then the server responds with an
`RpcResponse` or `RPCError`. This re-routing, serializing, dispatching, and
responding are all responsibilities of either `av/rpc/server/` or
`av/rpc/client`. 

The actual interface with `ClientRpc` inside `av/rpc/client/index.ts` should be
minimal but complete. We should be able to manipulate any part of the system
over the RPC layer, including overriding a Driver's state, the System's state,
listening to events propagated by the Websocket or notifications from the
server.

## av/sockets

This is the transport mediums between Driver implementations and the devices
over the network. These protocols include but are not limited to tcp, udp, ssh,
telnet, rs232 over usb, ir over usb, http/s. Obviously telnet, ssh, and http/s
are also over tcp, but they are complicated and different enough than normal
tcp that they deserve their own Socket implementation.

## av/telemetry

This is a slightly over-engineered logging system that I like. It creates spans
and allows me to never have to try/catch because I can wrap and piece of code
and never throw and also get automatic logging and assurance that the server
will never stop because of a bad call.

You should use `tel.task` or `this.tel.task` every time you want to do a try/catch.
It is always better in 100% of cases. If there is a slight chance that a function
call could possibly throw, you should wrap it in a `tel.task`. If there is not
already a Telemetry object in the current scope, you are always allowed to create one
with `const tel = new Telemetry("<function or class name>");`

## av/test

Ignore this directory unless specified otherwise.

## av/automation.ts

This is a sub file as an example of how I am going to take multiple Drivers and
their events and combine them into some new action. For example, if
`System.state.room.power === false` then I might want to set
`Camera.api.setPower(false);`. This kind of state machinery is the purpose of
an AV integration system and I want to make sure that the API we are creating
for future developers matches the goal of high ergonomics.

## av/bus.ts

The idea is that system-wide events go through the Bus, so different classes
don't need to subscribe the independent Driver implementations or other
TypedEventListeners. If there is an event that should be bubbled up to many
callers (read: any events that are relevant to more than one class invocation),
it probably belongs in Bus. We want to utilize all of the events for the frontend
as well, as the Websocket reads from the Bus and gets all of the events.

## av/index.ts

This is the reason why this library is vendored. The good thing about vendored
libraries in Typescript is that we can simplify the typing immensely. This is
where all of the setup happens.

## av/natav.ts

This is just where all of the Drivers live for the duration of the program and 
a bunch of Typescript so we get as close to as const descriptions of every piece
of the system. This is good for the RPC layer because the client contract is
inferred by the real types of the Drivers, System, etc.

## av/system.ts

This should be treated as a Driver. It just doesn't have a Socket because it is
100% internal state. This can grow to be arbitrarily complex. It's just that this
is the entrypoint to saying "I want some state on the server", or "I want to mutate
some server internal state through the system api".

## av/types.ts

Just a bunch of types besides the Natav namespace in `av/natav.ts`.
