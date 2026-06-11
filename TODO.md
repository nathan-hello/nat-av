## Replay

Set up an AutomationEngine-like thing that saves all of the writes, receives,
telemetry logs, and driver states to a file. Then provide a UI to 'replay' this
series of changes. Debugger situation where in the terminal you can step
through the events to see what went wrong with your internal state.

## RPC Function Serialization

Support passing functions through RPC as opaque references, with two lifetimes:
- request-scoped callbacks for `device.api.*` calls
- subscription-scoped callbacks for `device.event.on(...)`

This is a request/response problem. It should only share low-level transport
and reference bookkeeping with other RPC code.

Request-scoped callbacks must support round-tripping from client to server and
back during a single RPC call, so the RPC layer must marshal callback
invocations separately from normal JSON arguments/results.

Client/server flow for a request-scoped callback:
1. client sends a `request` for the outer API call with a callback reference
2. server receives the request and invokes the driver method
3. driver calls the callback like a normal function
4. RPC layer turns that callback call into a nested `request` to the client
5. client runs the real callback implementation
6. client sends back a `response` with the callback result
7. server resumes the driver method and finishes the outer `response`

Wire semantics:
- `request`: an RPC message that expects a `response`
- `response`: the reply to a `request`, carrying either a result or an error
- `notification`: an RPC message with no `response` expected, used for events

## RPC Driver-Defined Events

Add a new `device.event` RPC path for driver event subscriptions.

`device.event.on(event, cb)` should register a long-lived callback that is owned
by the RPC layer, not the driver. The driver should continue using normal
`TypedEventTarget` semantics locally, while the RPC layer handles
serialization, subscription tracking, callback invocation, and unsubscription.

This is a subscription/notification/unsubscription problem. It should be a
separate router and lifecycle from request-scoped function serialization.

Client/server flow for a subscription-scoped callback:
1. client sends a `request` to subscribe to an event
2. server registers the callback reference and driver listener
3. driver emits an event
4. RPC layer sends a `notification` to the client callback
5. client runs the callback implementation
6. `off()` sends a `request` to unsubscribe and release the callback reference
