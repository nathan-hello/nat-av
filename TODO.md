# Refactoring & Technical Debt Findings

## 1. RPC & Schema Duplication 
The transport is defined twice in av/schema/jsonrpc.ts and av/rpc/types.ts.
While @av/schema generates runtime metadata, a separate hand-maintained RPC
protocol model exists. This duplication creates compounding costs.

The device.dependents endpoint is the clearest example of a dead branch:
*   Injected in schema at av/schema/jsonrpc.ts:20-25
*   Handled in server at av/rpc/server/index.ts:56-60
*   Modeled in types at av/schema/types.ts:98-104
*   Finding: No real client use found; deps already exist in DriverSchema.deps.

## 2. Thin System Facade 
av/system.ts:19-38 exists mostly to support RPC bootstrap. It wraps GetSchema,
GetSystemState, GetDeviceState, and GetAllDeviceStates. These are only consumed
by ClientRpc init/refresh. This is significant surface area for a four-method
wrapper that can be deleted.


## 3. Passive Automation Service 
av/automation.ts:5-22 is a no-op service instantiated from av/index.ts. It
subscribes to state updates but performs no actions, representing pure
maintenance cost.
> This is okay because automation is going to be what I use for future 
> glue code between devices and system

## 4. Dormant Inventory 
Significant portions of @av/ contain dormant code rather than active product
features:
*   av/sockets/ssh.ts: Fully commented out file.
*   av/drivers/vaddio/roboshot.ts: Empty file.
*   av/sockets/udp.ts and av/drivers/mediasite: Unused implementations.
*   av/drivers/cisco/roomos: Unused, contains stray top-level sample code.

## 5. Dead Bus Events 
av/bus.ts:13-20 defines dead event types:
*   natav:state:override: Has a listener in av/driver.ts but no dispatcher.
*   natav:device:error: No producer or consumer.

## 6. Telemetry Over-Engineering 
The telemetry framework is oversized for a ~5k LOC application.
SimpleConsoleExporter is duplicated across av/telemetry/exporters.ts and
av/telemetry/server/exporters.ts. Unless spans and traces are active product
features, the custom infrastructure in index.ts, sdk.ts, and runtime.ts is
excessive.

## 7. Library Duplication 
In av/lib/eventtarget.ts, the classes defined in lines 3-78 and 80-138 are
nearly identical.

---

# Transformation Roadmap

## Immediate Deletions
1. Delete AutomationEngine entirely.
2. Delete device.dependents end-to-end.
3. Remove av/sockets/ssh.ts, av/drivers/vaddio/roboshot.ts, and unused
UDP/Cisco/Mediasite drivers.
4. Remove unused bus events and collapse duplicate telemetry exporters.

## Structural Strategy (The "Big Step") The highest leverage move is to make
the generated schema the sole runtime metadata contract and reduce RPC to two
primary concepts:

1.  **Bootstrap Request:** Returns { schema, connections, states }.
2.  **Device Call:** Invokes device API.
3.  **Notifications/Logs:** Unified websocket for state and logging.

This allows for the total removal or heavy shrinking of av/system.ts,
SystemRpcRequest machinery, client system proxies, and the redundant transport
section in av/schema/jsonrpc.ts.
