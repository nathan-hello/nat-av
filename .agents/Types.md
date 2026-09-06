 # Natav Type System Plan

## Goals

The type system should provide exact inference across drivers, dependencies,
plugins, manager lookup, events, state, APIs, and RPC while keeping the public
API small and constructor-oriented.

The design should avoid:

- Positional generic parameters for values that concrete subclasses already infer.
- Arbitrary recursion-depth limits.
- `any` at public type boundaries.
- Reconstructing the application graph through a separate fluent builder.
- Treating runtime RPC data as statically verified without validation.

Assertions remain acceptable at unavoidable runtime boundaries, such as dynamic
proxies, heterogeneous maps, and parsed network data. They should be localized
and should not leak `any` into public types.

## Driver

The public `Driver` generic parameters are:

```ts
abstract class Driver<
  Name extends string,
  State extends Record<string, unknown>,
  Deps extends readonly Driver[] = readonly [],
> {
  readonly name: Name;
  readonly deps: Deps;

  abstract state: State;
  abstract api: Drivers.ApiRecord;
}
```

`Name` and `State` are required. `Deps` defaults to an empty tuple, meaning a
driver with no dependency generic has no dependencies. It must not default to
an open `Driver[]`, because that would mean the driver may depend on anything
and would destroy useful inference.

`Api`, `Events`, and `Socket` are removed from the base-class generic list.
Concrete subclasses narrow those properties naturally:

```ts
class Decoder extends Driver<"decoder", DecoderState> {
  state = { ready: false };

  api = {
    decode: (input: string) => input,
  };

  events = new TypedEventTarget<{
    decoded: { value: string };
  }>();
}
```

`DriverShape` may exist as an internal structural constraint for type utilities,
but public dependency APIs should use `Driver`.

## Dependencies

Dependencies remain a flat array. No new object-shaped `deps` format is added.

Single dependency tuples preserve exact lookup:

```ts
class Wall extends Driver<"wall", WallState, readonly [Decoder]> {
  constructor(decoder: Decoder) {
    super({ name: "wall", deps: [decoder] });
  }
}
```

Mixed or dynamic dependencies are valid:

```ts
class Codec extends Driver<
  "codec",
  CodecState,
  readonly (Decoder | Encoder)[]
> {
  constructor(decoders: Decoder[], encoders: Encoder[]) {
    super({
      name: "codec",
      deps: [...decoders, ...encoders],
    });
  }
}
```

The driver can retain grouped application-specific values as ordinary fields;
the manager graph remains flat:

```ts
class Codec extends Driver<"codec", CodecState, readonly (Decoder | Encoder)[]> {
  constructor(
    readonly decoders: Decoder[],
    readonly encoders: Encoder[],
  ) {
    super({ name: "codec", deps: [...decoders, ...encoders] });
  }
}
```

Precision follows the value supplied by the caller:

- A tuple of named drivers preserves exact names and `dep(name)` return types.
- `Decoder[]` returns `Decoder` from dependency lookup.
- `(Decoder | Encoder)[]` returns `Decoder | Encoder`.
- A widened `Driver[]` correctly returns `Driver`.

Direct dependency lookup remains local to the driver:

```ts
dep<Name extends Deps[number]["name"]>(
  name: Name,
): Extract<Deps[number], { name: Name }>;
```

This allows arbitrarily long typed chains without recursively expanding the
entire application graph for every lookup:

```ts
root.dep("level-2").dep("level-3").dep("leaf");
```

## Driver Catalog

The manager derives a flat name-indexed catalog from the supplied root drivers
and their dependency closure:

```ts
type DriverClosure<D, Seen = never> =
  D extends Driver
    ? D extends Seen
      ? never
      : D | DriverClosure<D["deps"][number], Seen | D>
    : never;

type DriverCatalog<Roots extends readonly Driver[]> = {
  [D in DriverClosure<Roots[number]> as D["name"]]: D;
};
```

The actual implementation should use internal helpers as needed, but it must
not use a fixed depth tuple or stop recursion merely because a dependency is an
open array. Open arrays lose literal-name precision by nature, but their driver
types still belong in the closure.

For a root chain of `Root -> Level2 -> Level3 -> Leaf`, the catalog is:

```ts
{
  root: Root;
  "level-2": Level2;
  "level-3": Level3;
  leaf: Leaf;
}
```

Manager lookup is direct catalog indexing:

```ts
GetDriver<Name extends keyof Catalog & string>(name: Name): Catalog[Name];
```

The manager must validate duplicate names at runtime. Type-level duplicate-name
handling should reject incompatible drivers where practical; runtime identity
checks remain necessary because TypeScript cannot prove that two values with the
same name are the same instance.

Shared dependencies are valid and form a DAG:

```text
wall      -> decoder
recorder  -> decoder
```

The same decoder instance may appear below both roots.

## Exact Tree

The object graph already represents the dependency tree. No fluent builder is
introduced to rebuild it.

`GetTree()` is a separate recursive projection of the supplied root tuple:

```ts
type DriverTreeNode<D extends Driver> = {
  name: D["name"];
  driver: D;
  deps: {
    readonly [K in keyof D["deps"]]:
      D["deps"][K] extends Driver
        ? DriverTreeNode<D["deps"][K]>
        : never;
  };
};
```

The exact nested tree type is used only for `GetTree()`. Global lookup, state,
API, events, and RPC use the flat catalog. This isolates recursive type work to
the API that actually returns a nested tree.

If a dependency is an open array, the tree contains an open array of the
corresponding node type. If it is a tuple, the tree preserves the tuple.

Shared dependencies appear beneath each root that references them. The runtime
objects remain identical even when the presentation tree contains multiple
references.

## Plugins

A plugin is a `Driver` that receives a manager in its constructor and therefore
has manager-wide authority to inspect or affect the rest of the system.

The deferred value in manager configuration is only the construction mechanism;
it is not the plugin abstraction.

```ts
class SchemaPlugin extends Driver<"schema", SchemaState> {
  constructor(private readonly manager: ManagerRuntimeView) {
    super({ name: "schema" });
  }

  override start() {
    for (const name of this.manager.GetAllDriverNames()) {
      // Inspect or affect the assembled system.
    }
  }
}
```

Plugins are kept in a separate catalog from ordinary drivers:

```ts
manager.driver.decoder;
manager.driver.wall;
manager.plugin.schema;
manager.plugin.rpc;
```

The same separation exists for RPC:

```ts
rpc.driver.decoder;
rpc.driver.wall;
rpc.plugin.schema;
rpc.plugin.rpc;
```

Plugin constructors receive a manager that can be retained, but manager lookup
and plugin interaction are only valid after assembly. The manager should enforce
this lifecycle at runtime if a constructor attempts to use the incomplete
manager.

Assembly order:

1. Collect and instantiate ordinary drivers from the root drivers.
2. Build the complete ordinary-driver catalog.
3. Create the manager shell.
4. Construct plugins with the manager shell.
5. Build the complete plugin catalog.
6. Validate plugin names and requirements.
7. Mark the manager assembled.
8. Start ordinary drivers in dependency order.
9. Start plugins.

Plugins that need specific application drivers should declare requirements and
receive a typed view of those entries. Generic plugins can use the dynamic
manager view (`FindDriver`, `GetAllDriverNames`, and the runtime bus).

Configured plugins remain constructor-oriented. A package may expose a bound
constructor helper for ergonomics:

```ts
plugins: [
  SchemaPlugin,
  RpcPlugin.configure({ transport, path: "/ws" }),
]
```

The helper is optional and does not change the plugin model.

## Manager Configuration

The preferred caller API keeps concrete constructors and root arrays:

```ts
const leaf = new LeafDriver();
const level3 = new Level3Driver(leaf);
const level2 = new Level2Driver(level3);
const root = new RootDriver(level2);

const manager = new Manager({
  drivers: [root] as const,
  plugins: [
    SchemaPlugin,
    RpcPlugin.configure({ transport }),
  ] as const,
});
```

The manager discovers the ordinary dependency closure from `root`, but the
types do not use that closure recursively for every operation. The closure is
used once to form the catalog; operations then use direct catalog indexing.

No `defineDrivers()` builder is required. The constructor graph is the source
of truth and the manager configuration only chooses roots and plugins.

## RPC

RPC is parameterized by the two catalogs, not by the complete runtime Manager:

```ts
type SystemCatalog = {
  drivers: DriverCatalog;
  plugins: PluginCatalog;
};

class RpcClient<System extends SystemCatalog> {
  readonly driver: RemoteEntries<System["drivers"]>;
  readonly plugin: RemoteEntries<System["plugins"]>;
}
```

Remote APIs use one canonical recursive transformation:

```ts
type RemoteApi<T> = {
  [K in keyof T]:
    T[K] extends (...args: infer Args) => infer Result
      ? (...args: Args) => Promise<Awaited<Result>>
      : T[K] extends object
        ? RemoteApi<T[K]>
        : T[K];
};
```

RPC requests derive their result from the request method. Callers cannot select
an arbitrary response type:

```ts
request<Request extends RpcRequest>(
  request: Request,
): Promise<ResultOf<Request>>;
```

The init response, event notifications, state updates, and API calls use shared
wire DTOs. Runtime parsing validates data before it is converted to application
types.

Custom event notifications preserve all three correlations:

- Driver namespace and name.
- Event name.
- Event payload.

Client state is `State | undefined` until initialization is complete, unless the
client lifecycle is redesigned so a handle cannot be obtained before state is
validated.

## Type Safety and Assertions

Replace public `any` with `unknown`, `Rpc.Json.Value`, or precise mapped types.
Localize assertions to:

- Dynamic API proxies.
- Heterogeneous runtime maps.
- Runtime graph materialization.
- Validated network data.

Add compiler-only tests for:

- Exact driver names, states, APIs, events, and sockets.
- Tuple dependencies and open dependency arrays.
- Mixed `(Decoder | Encoder)[]` dependencies.
- Shared dependencies and arbitrary-depth chains.
- Exact `GetTree()` output types.
- Duplicate names and missing dependency names.
- Plugin namespaces and plugin requirements.
- Remote API promise results.
- Invalid RPC methods, arguments, events, and state fields.

## Implementation Order

1. Finalize `Driver<Name, State, Deps = readonly []>`.
2. Remove `Api`, `Events`, and `Socket` from the base generic list.
3. Update all driver declarations and callers.
4. Add internal structural driver utilities without importing runtime classes.
5. Replace the depth-limited dependency utilities with a cycle-aware closure.
6. Build a flat name-indexed driver catalog.
7. Make `Manager.GetDriver` and related utilities use direct catalog indexing.
8. Make `GetTree()` an exact recursive projection of root dependencies.
9. Add plugin constructors, plugin catalog typing, and assembly lifecycle checks.
10. Expose separate `driver` and `plugin` namespaces.
11. Parameterize RPC by the two catalogs.
12. Fix remote API promisification and request-result inference.
13. Correct init DTOs, event correlation, request ID handling, and subscription keys.
14. Replace avoidable `any` and assertions with `unknown` and validated boundaries.
15. Add positive and negative compiler tests before removing old type utilities.

## Caller API Summary

### Define a driver

```ts
class Decoder extends Driver<"decoder", DecoderState> {
  state = { ready: false };
  api = { decode: (input: string) => input };
}
```

### Define direct dependencies

```ts
class Wall extends Driver<"wall", WallState, readonly [Decoder]> {
  constructor(decoder: Decoder) {
    super({ name: "wall", deps: [decoder] });
  }
}
```

### Define dynamic or mixed dependencies

```ts
class Codec extends Driver<
  "codec",
  CodecState,
  readonly (Decoder | Encoder)[]
> {
  constructor(decoders: Decoder[], encoders: Encoder[]) {
    super({ name: "codec", deps: [...decoders, ...encoders] });
  }
}
```

### Define a plugin

```ts
class SchemaPlugin extends Driver<"schema", SchemaState> {
  constructor(manager: ManagerRuntimeView) {
    super({ name: "schema" });
    this.manager = manager;
  }
}
```

### Assemble the system

```ts
const manager = new Manager({
  drivers: [root] as const,
  plugins: [SchemaPlugin, RpcPlugin.configure({ transport })] as const,
});
```

### Access local entries

```ts
manager.GetDriver("decoder").api.decode("input");
manager.GetDriver("wall").dep("decoder").state.ready;
manager.driver.decoder;
manager.plugin.schema;
manager.GetTree();
```

### Access remote entries

```ts
rpc.driver.decoder.api.decode("input"); // Promise<string>
rpc.driver.wall.state;
rpc.plugin.schema.api.generate(); // Promise<...>
rpc.driver.wall.event.on("changed", (payload) => {
  payload;
});
```

The caller supplies ordinary constructors, direct dependency arrays, root
drivers, and plugin constructors. The type system derives the catalogs, exact
lookups, dependency chains, tree shape, RPC namespaces, event payloads, and
remote API results from those values.
