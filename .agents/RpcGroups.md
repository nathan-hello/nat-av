# RPC Groups

This plan adds named, nested driver groups to the manager and exposes them
through the RPC facades. It is independent of Remix SSR. Groups can be
implemented and tested against the manager, core RPC catalog, and client
facade before SSR exists.

## Type-System Refactor

Before adding groups, replace the separate, partially overlapping driver and
plugin projections with one managed-entry model. A driver and a plugin have
the same runtime contract after construction:

```ts
type ManagedContract<
  Name extends string = string,
  State extends Record<string, unknown> = Record<string, unknown>,
  Api extends ApiRecord = ApiRecord,
  Events = unknown,
  Deps extends readonly ManagedContract[] = readonly [],
> = {
  readonly name: Name;
  readonly state: State;
  readonly api: Api;
  readonly events: Events;
  readonly deps: Deps;
};
```

Drivers and plugins are differentiated by their construction channel, not by
their state/API/event/handle shape:

```ts
type DriverFactory<D extends ManagedContract> = () => D;
type PluginFactory<P extends ManagedContract> =
  (manager: ManagerRuntimeView) => P;
```

The concrete `Driver` base class may continue to implement this contract. A
plugin may be a concrete `Driver` subclass; the important distinction is that
plugin construction receives a manager view and ordinary driver construction
does not.

Both kinds of managed entry may have dependencies:

- A driver may depend on a driver or plugin.
- A plugin may depend on a driver or plugin.
- A plugin's manager lookup during construction is not automatically a
  dependency; lifecycle ordering must come from the declared `deps` graph.
- The same dependency closure and duplicate-name validation apply to both.
- Shared runtime objects have one identity, one lifecycle, and one cached RPC
  handle.

Use one unified closure and catalog foundation:

```ts
type ManagedClosure<Entry, Seen = never> =
  Entry extends ManagedContract ?
    Entry extends Seen ? never
    : Entry | ManagedClosure<Entry["deps"][number], Seen | Entry>
  : never;

type ManagedCatalog<Entries extends readonly ManagedContract[]> =
  ManagedClosure<Entries[number]>;

type SystemCatalog<
  DriverEntries extends readonly ManagedContract[],
  PluginEntries extends readonly ManagedContract[],
> = {
  readonly managed: ManagedClosure<
    DriverEntries[number] | PluginEntries[number]
  >;
  readonly drivers: ManagedCatalog<DriverEntries>;
  readonly plugins: ManagedCatalog<PluginEntries>;
  readonly groups: GroupCatalog;
};
```

The actual catalog types should retain the driver/plugin subsets rather than
repeating unrelated `DriverShape`, `AnyDriver`, `Drivers.Handle`, plugin
catalog, and RPC handle definitions. Derive these projections from the one
managed catalog:

```ts
type ManagedName<Entry> =
  Entry extends { readonly name: infer Name extends string } ? Name : never;

type ManagedNames<Catalog> = ManagedName<Catalog>;

type ManagedByName<Catalog, Name extends string> =
  Catalog extends { readonly name: infer Known extends string } ?
    string extends Known ? Catalog
    : string extends Name ? Catalog
    : Name extends Known ? Catalog
    : never
  : never;
```

This preserves exact literal names for static tuples while preserving the
underlying contract for runtime-created arrays such as `Decoder<string>[]`.
The public type system should use these catalog projections for names, state,
API, events, dependencies, local handles, RPC handles, and plugins.

### Handle Projections

Define one common handle projection and add only transport-specific behavior:

```ts
type RemoteHandle<Entry extends ManagedContract> = {
  readonly name: Entry["name"];
  readonly state: Entry["state"];
  readonly api: PromisifyApi<Entry["api"]>;
  readonly events: Entry["events"];
};

type RemoteManagedHandle<Entry extends ManagedContract> =
  RemoteHandle<Entry> & {
    readonly deps: {
      readonly [K in keyof Entry["deps"]]:
        RemoteManagedHandle<Entry["deps"][K]>;
    };
    dep<Name extends ManagedNames<Entry["deps"][number]>>(
      name: Name,
    ): RemoteManagedHandle<ManagedByName<Entry["deps"][number], Name>>;
  };
```

Drivers and plugins use the same `RemoteManagedHandle` shape. They do not need
separate state/API/handle types merely because plugins were manager-aware
during construction. Driver and plugin access remain separate public
namespaces:

```ts
rpc.driver("decoder-a");
rpc.plugin("schema");
rpc.find.driver<Decoder>(runtimeName);
rpc.find.plugin<SchemaPlugin>(runtimeName);
```

The catalog is the single source from which these APIs are derived:

```text
managed entries
  -> unified dependency closure
  -> driver/plugin catalog views
  -> local and RPC handles
  -> strict and dynamic lookup
  -> groups
  -> runtime wire catalog
```

## Goal

Avoid hardcoded driver-name lists in UI code while preserving useful literal
type inference:

```tsx
const decoders = rpc.group("decoders/roomA");
```

No browser code should import a concrete driver class or use `instanceof` to
discover a driver. Group membership is declared where the manager is built and
serialized as catalog metadata.

## Manager Input

Support recursive group namespaces in `Manager` configuration. Groups are a
driver-oriented view over managed entries; plugins remain separately
registered and addressable, even though they use the same managed contract.

```ts
const natav = new Manager({
  drivers: [
    {
      decoders: {
        roomA: [
          new Decoder({ name: "DEC-A-01", socket: decoderA1 }),
          new Decoder({ name: "DEC-A-02", socket: decoderA2 }),
        ],
        roomB: [
          new Decoder({ name: "DEC-B-01", socket: decoderB1 }),
        ],
      },
    },
    new Paint({
      outputDir: "./tmp/paint",
      paints: { main: { width: 1920, height: 1080 } },
    }),
  ],
  plugin: [
    (manager) => new SchemaPlugin(manager),
  ],
});
```

Conceptually:

```ts
type GroupInput<Driver extends ManagedContract> =
  | readonly Driver[]
  | { readonly [name: string]: GroupInput<Driver> };

type DriverInput<Driver extends ManagedContract> =
  | Driver
  | { readonly [name: string]: GroupInput<Driver> };
```

The manager flattens every managed entry into the unified runtime catalog.
Driver groups are additional membership metadata, not a replacement for
driver/plugin identity or dependencies.

Plugins may have dependencies and are included in the unified dependency
closure, but they are not implicitly group members. If plugin groups become a
real requirement, the same recursive group machinery can be generalized to
`GroupInput<ManagedContract>` without changing the managed-entry model.

### Runtime-Created Members

Leaf arrays may contain runtime-created instances whose names are not known to
TypeScript:

```ts
const decoders = configFile.decoders.map(
  (config) =>
    new Decoder({
      name: config.name,
      socket: new Tcp({ addr: config.ipv4, port: 1234 }),
    }),
);

const natav = new Manager({
  drivers: [{ decoders }],
});
```

The manager knows every name by construction time and can build a complete
runtime catalog, but the TypeScript type is approximately `Decoder<string>[]`.
The names are dynamic while the driver contract is still known to be
`Decoder`. This is supported; the manager does not need to add entries after
construction.

## Runtime Rules

- A group object is a namespace and is not itself a driver member.
- A leaf array contains normal managed driver instances.
- Group paths are static for the manager lifetime.
- Group names must not contain `/`; reject them at manager construction so
  slash paths are unambiguous.
- Group paths must be unique.
- Driver and plugin names share the unified identity namespace and must not
  collide.
- The same driver instance may appear in multiple groups.
- Group membership is separate from managed-entry dependencies.
- Lifecycle operations and RPC handles are deduplicated by managed identity.
- Empty groups are valid and retain their declared path.
- Group order and member order are stable.
- Nested group lookup must not duplicate state stores or subscriptions.
- A parent group contains every driver in every descendant leaf group.
- Dependencies of a grouped driver do not automatically become group members.

For example, `decoders/roomA` contains the two room A decoders, while
`decoders` contains all drivers in both `roomA` and `roomB`, in stable
depth-first declaration order. The parent group does not return child-group
handles.

## Type-Safe Names And Paths

The manager's `const` generic must preserve the recursive literal structure.
Type utilities can derive the complete finite set of valid driver names, plugin
names, group paths, and members at every path:

```ts
type DriverNames<System> =
  /* "DEC-A-01" | "DEC-A-02" | "DEC-B-01" | "video-wall" */;

type PluginNames<System> =
  /* "schema" */;

type GroupPaths<System> =
  /* "decoders" | "decoders/roomA" | "decoders/roomB" */;

type GroupMembers<System, Path extends GroupPaths<System>> =
  /* recursively flattened driver tuple at Path */;
```

For the example configuration, the compiler should infer:

```ts
rpc.group("decoders");
// readonly [
//   DriverHandle<Decoder<"DEC-A-01">>,
//   DriverHandle<Decoder<"DEC-A-02">>,
//   DriverHandle<Decoder<"DEC-B-01">>,
// ]

rpc.group("decoders/roomA");
// readonly [
//   DriverHandle<Decoder<"DEC-A-01">>,
//   DriverHandle<Decoder<"DEC-A-02">>,
// ]

rpc.group("decoders/unknown"); // TypeScript error
rpc.driver("not-a-driver"); // TypeScript error
rpc.plugin("not-a-plugin"); // TypeScript error
```

The public typed facade should not add a general `string` overload to
`rpc.driver()`, `rpc.plugin()`, or `rpc.group()`. With a literal manager
configuration, these functions should accept only the corresponding catalog
name/path unions. This rejects typos and prevents a component from requesting
an entry absent from that manager.

For example, this preserves the finite group-path union:

```ts
const groups = {
  decoders: {
    roomA: [decoderA1, decoderA2],
    roomB: [decoderB1],
  },
} satisfies GroupInput<Decoder>;

const manager = new Manager({ drivers: [groups] });
// The manager's type contains "decoders", "decoders/roomA", and
// "decoders/roomB", rather than widening those paths to string.
```

The recursive input parser must distinguish driver arrays from group objects
without confusing a driver instance with a namespace object.

By contrast, `Record<string, GroupInput<Driver>>` explicitly means that any
string key may exist. TypeScript then cannot distinguish `"roomA"` from
`"typo"`, so it has no sound finite union to give to `rpc.group()`. The same
applies to names received from a database or other runtime source.

That does not weaken the normal API. Dynamic input crosses an explicit runtime
boundary through `rpc.find.*`, described below. Do not silently widen the
ordinary lookup methods to accept arbitrary strings.

## Public API

All group paths return driver collections. A parent path recursively flattens
all descendant leaf members:

```ts
rpc.driver("DEC-A-01");
rpc.driver("video-wall").deps;
rpc.plugin("schema");
rpc.group("decoders");
rpc.group("decoders/roomA");
rpc.drivers();
rpc.plugins();
```

`rpc.group(path)` and `rpc.drivers()` expose the same collection surface:

```ts
const roomA = rpc.group("decoders/roomA");
const allDecoders = rpc.group("decoders");
const allDrivers = rpc.drivers();

const roomADrivers = roomA.array();
const everyDecoder = allDecoders.array();
const everyDriver = allDrivers.array();
```

For statically known tuples, `.array()` widens a readonly tuple into a mutable
array of its member union. For runtime-created groups, the result is already a
runtime array whose element type retains the known managed contract. Neither
operation changes runtime membership, ordering, state synchronization, or
handle identity.

Plugins have the same collection mechanics but remain outside `rpc.drivers()`
and driver groups:

```ts
const plugins = rpc.plugins();
const pluginArray = plugins.array();
```

## Explicit Dynamic Lookup

Runtime configuration can make individual names or group paths unknown at
compile time even though the application knows the expected managed contract.
Keep this uncertainty behind an explicit `find` namespace:

```ts
const decoder = rpc.find.driver<Decoder>(configFile.decoders[0].name);
const roomDecoders = rpc.find.group<Decoder>(runtimeGroupPath);
const plugin = rpc.find.plugin<SchemaPlugin>(pluginName);
```

The dynamic APIs accept `string` and return `undefined` when the runtime
catalog has no matching entry:

```ts
  readonly name: string;
  readonly state: Entry["state"];
  readonly api: PromisifyApi<Entry["api"]>;
  readonly events: Entry["events"];
  // lifecycle and event methods match RemoteHandle
};

const decoder = rpc.find.driver<Decoder>(runtimeName);
if (decoder) {
  await decoder.api.fetchContext();
}
```

These values are RPC handles, not local driver or plugin instances. The generic
parameter supplies the contract the caller expects; it does not perform
runtime validation. Supplying the wrong type is an intentional, documented
assertion boundary:

```ts
// The application owns the manager configuration and is responsible for this
// assertion being correct.
const decoders = rpc.find.group<Decoder>(runtimeGroupPath);
```

For a statically declared group whose members are `Decoder<string>[]`, prefer
the typed group API because it can infer the member contract without repeating
the generic:

```ts
const decoders = rpc.group("roomA");
// readonly DynamicHandle<Decoder>[]
```

Use `rpc.find.group<Decoder>(path)` when the group path itself is runtime data.
Use `rpc.find.driver<Decoder>(name)` when the driver name is runtime data but
the application knows which contract it expects. Use `rpc.find.plugin<Type>`
for the corresponding plugin case. Driver and plugin catalogs remain separate.

Dynamic group lookup should support member lookup constrained by the supplied
contract:

```ts
const decoder = rpc.find.group<Decoder>(roomPath)?.find(decoderName);
```

This returns `DynamicHandle<Decoder> | undefined`, rather than a union of every
managed type in the system.

The manager and RPC client must validate the runtime name or path against the
authoritative catalog before returning a dynamic handle. Unknown values return
`undefined`; they must not create speculative cached handles that only fail
when an RPC request reaches the server.

## Unified Dependency And Handle Model

Every managed entry uses the same dependency model. A driver or plugin can
declare direct dependencies, while the catalog derives the transitive closure:

```ts
type DependencyNames<Entry extends ManagedContract> =
  ManagedNames<Entry["deps"][number]>;
```

`RemoteManagedHandle` is the common handle projection defined above; it applies
to both drivers and plugins. `DependencyNames` is the only additional helper
needed for direct dependency lookup.

`rpc.driver(name)`, a group member, a dependency handle, and
`rpc.find.driver<T>(name)` must all reuse the same cached handle for one runtime
identity. The same rule applies to plugins through `rpc.plugin` and
`rpc.find.plugin`.

Manager construction should be explicit about the two channels:

1. Construct ordinary drivers without manager access.
    2. Construct plugin entries with the manager runtime view.
3. Build the initial driver catalog.
4. Create the manager runtime view.
5. Construct plugins with that manager view.
6. Resolve plugin dependencies and the unified managed closure.
7. Reject duplicate names across drivers and plugins.
8. Build driver and plugin catalog views over the unified catalog.
9. Start all managed entries in declared dependency order.

Manager lookup during plugin construction is access, not dependency declaration.
If lifecycle ordering depends on an entry, it must appear in `deps`.

## RPC Catalog

The runtime catalog is the authoritative source for dynamic lookup and should
contain both namespaces, dependency topology, and recursively flattened group
membership:

```ts
type GroupEntryWire = {
  readonly path: string;
  readonly children: readonly string[];
  readonly drivers: readonly string[];
};

type RuntimeCatalogWire = {
  readonly drivers: readonly string[];
  readonly plugins: readonly string[];
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
  readonly groups: readonly GroupEntryWire[];
  readonly tree: readonly DriverView[];
};
```

The server and client must validate this catalog during initialization. The
client stores it before enabling dynamic lookup, verifies every state key and
group member against the catalog, and creates handles only for known entries.

Example group representation:

```json
{
  "path": "decoders",
  "children": ["decoders/roomA", "decoders/roomB"],
  "drivers": ["DEC-A-01", "DEC-A-02", "DEC-B-01"]
}
```

The browser resolves every member through the existing handle cache. Group
lookups therefore do not create independent state stores or subscriptions.

## Example

```tsx
function DecoderGrid(handle: Handle) {
  const rpc = getRpc(handle);
  const decoders = rpc.group("decoders").array();

  return () => (
    <div>
      {decoders.map((decoder) => (
        <article key={decoder.name}>
          <h2>{decoder.name}</h2>
          <p>{decoder.state.connected ? "Online" : "Offline"}</p>
        </article>
      ))}
    </div>
  );
}
```

The setup/render lifecycle and live state updates in this example are owned by
the Remix SSR plan. The group feature supplies the collection and catalog
metadata; the same metadata also supports runtime `find` APIs.

## Implementation Order

1. Replace separate driver/plugin projections with `ManagedContract`, one
   dependency closure, and catalog projections.
2. Preserve concrete driver classes while making plugin construction the only
   manager-aware channel.
3. Separate driver roots, plugin entries, unified managed entries, and group
   membership in manager assembly.
4. Support runtime-created homogeneous arrays such as `Decoder<string>[]` and
   correct widened-name matching in `ManagedByName`.
5. Introduce recursive group input and derive literal group paths and
   recursively flattened descendant members.
6. Reject invalid names, duplicate paths, and duplicate driver/plugin names.
7. Deduplicate lifecycle operations and handles for overlapping membership and
   shared dependencies.
8. Add the validated runtime catalog containing drivers, plugins, dependencies,
   groups, and states.
9. Add `rpc.group(path)`, `rpc.drivers()`, `rpc.plugins()`, and `.array()` using
   the shared collection abstraction.
10. Add strict `rpc.driver()`, `rpc.plugin()`, and `rpc.group()` catalog views.
11. Add `rpc.find.driver<T>()`, `rpc.find.group<T>()`, and
    `rpc.find.plugin<T>()` as explicit runtime lookup APIs returning `undefined`
    for missing entries.
12. Add group-constrained dynamic member lookup and unified dependency handles.
13. Add SSR/hydration catalog round-trip tests once the Remix binding exists.

## Dependency With Remix SSR

This feature does not block the SSR feature. The manager and core RPC layers
can implement managed catalogs and groups independently. SSR needs to serialize
and hydrate the driver/plugin/group catalog along with the initial state
snapshot; it does not change group inference, plugin construction, or runtime
dependency semantics.
