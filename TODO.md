Findings
1. av/schema/jsonrpc.ts:9-41 and av/rpc/types.ts:23-58 define the transport twice.
@av/schema is already generating runtime metadata, but you also keep a separate hand-maintained RPC protocol model. That duplication is where the compounding cost is coming from. device.dependents is the clearest dead branch here:
- schema advertises it at av/schema/jsonrpc.ts:20-25
- RPC server handles it at av/rpc/server/index.ts:56-60,86-95
- schema types model it at av/schema/types.ts:98-104
- I couldn’t find a real client use
Since deps are already in DriverSchema.deps at av/schema/types.ts:57, this endpoint looks removable.
2. av/system.ts:19-38 is a very thin facade that exists mostly to support RPC bootstrap.
Right now System only wraps:
- GetSchema
- GetSystemState
- GetDeviceState
- GetAllDeviceStates
Those are only consumed by ClientRpc init and refresh in av/rpc/client/index.ts:100-105,144-148. This is a lot of surface area for a four-method wrapper. It looks like an indirection layer you can delete.
3. av/automation.ts:5-22 is a no-op service but is still instantiated from av/index.ts:2,53.
It subscribes to state updates and does nothing. That is pure maintenance cost right now.
4. A chunk of @av/ is clearly dormant inventory, not active product code.
The current app only instantiates decoder/display in av/index.ts:32-42, but @av/ still carries:
- fully commented file: av/sockets/ssh.ts:1-191
- empty file: av/drivers/vaddio/roboshot.ts
- apparently unused implementations: av/sockets/udp.ts:19-152, av/drivers/mediasite/index.ts, av/drivers/cisco/roomos/index.ts
The Cisco file also has stray top-level sample code at av/drivers/cisco/roomos/index.ts:27-33.
5. av/bus.ts:13-20 still defines dead event types.
I could only find:
- natav:state:override listened to in av/driver.ts:30-38, but no dispatcher
- natav:device:error with no producer/consumer at all
Those look removable until there is a real use.
6. Telemetry is carrying more framework than the current app size seems to justify.
There’s real duplication:
- av/telemetry/exporters.ts:68-96
- av/telemetry/server/exporters.ts:35-63
Both define SimpleConsoleExporter.
More broadly, av/telemetry/index.ts, sdk.ts, runtime.ts, exporters.ts, server/exporters.ts is a lot of custom infra for a ~5k LOC app unless you are actively using spans/traces as a product feature.
7. av/lib/eventtarget.ts:3-78 and av/lib/eventtarget.ts:80-138 are nearly the same class twice.
That’s not the main cost center, but it’s the kind of local duplication that accumulates.
What I’d Remove First
1. Delete AutomationEngine entirely.
2. Delete device.dependents end to end.
3. Delete dead inventory:
   - av/sockets/ssh.ts
   - av/drivers/vaddio/roboshot.ts
   - probably udp, mediasite, cisco/roomos too if they are not on the immediate roadmap
4. Delete unused bus events.
5. Collapse duplicate telemetry exporters.
Big Step Function
The highest-leverage simplification is:
1. Make the generated schema the only runtime metadata contract.
2. Reduce RPC to two concepts:
   - one bootstrap request
   - one device call request
3. Remove the whole system RPC surface.
Concretely, I’d replace this:
- system.GetSchema
- system.GetSystemState
- system.GetAllDeviceStates
- system.GetDeviceState
- device.dependents
with this:
- bootstrap -> returns { schema, connections, states }
- device.call -> invokes device API
- notifications -> state/connected/disconnected
- logs -> same websocket, same as now
That lets you delete or heavily shrink:
- av/system.ts
- most of the SystemRpcRequest machinery in av/rpc/types.ts
- the client system proxy in av/rpc/client/index.ts
- the transport section in av/schema/jsonrpc.ts
- device.dependents
- a bunch of duplicated init/request logic
Why this is 100x cheaper
Because it moves you to one source of truth per concern:
- schema generation owns runtime introspection
- RPC owns transport
- Natav owns drivers/state
- optional systems like automation/extra drivers/telemetry stay out of the core path unless actually used
Right now the expensive part is not raw LOC. It’s that the same idea exists in 2-3 places:
- transport shape in schema and RPC types
- bootstrap state in System and client init
- optional subsystems living as if they are core
If you want, I can turn this into a concrete delete list by file, with “safe now” vs “only if not on roadmap.”
