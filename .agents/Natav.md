# nat-av Library

Natav is a vendored library that is in the ./av directory.

Its primary goal is to provide a high quality programming environment for
communicating directly with other devices on a local area network. 

## Real world example for context

In a room there is several Decoders that make up one Video Wall. Each Decoder
is responsible for one piece of the Video Wall. This means that the several
different Decoders has their own APIs, and the Video Wall class is responsible
for orchestrating them. For example if a new Window sits between the edges of
two Decoders, we need something to tell each of the Decoder what they are
responsible for. This is just one example of why a node server will need to
talk to devices on the network.

One big problem with consistently talking to devices is their delimiter. This
is why you can use an off the shelf delimiter as in `av/sockets/delimiters.ts`,
or create your own. Delimiters are a responsibility of the Driver
implementation because it does not change between invocations, but it does
change between Drivers.

# Files & Folders

## av/driver.ts

The goal of the Driver class in `av/driver.ts` is to create a base over which I
can make these APIs and relationships. It should do all potenital work that
will consistently be shared between drivers implementations.

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
