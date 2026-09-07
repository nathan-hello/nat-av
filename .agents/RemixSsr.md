# Remix SSR RPC

This plan adds request-scoped server rendering, snapshot hydration, and live
browser synchronization to `@nat-av/frontend-remix`. It does not depend on
driver groups. The SSR binding should work first with named drivers and later
consume group catalog metadata without changing its lifecycle model.

## Design Contract

- Server rendering uses a fresh RPC binding for every HTTP request.
- SSR never constructs a browser WebSocket.
- Browser code uses one page-scoped RPC client backed by WebSocket.
- The response is rendered from one immutable request snapshot.
- The browser hydrates from the exact snapshot used to produce the HTML.
- The browser then reconciles with current server state and live updates.
- No module-level client or connection is shared by SSR requests.
- Application components do not inspect `window`, `WebSocket`, or execution
  environment to select their RPC client.

## The Same `getRpc` Function

Application code should expose one stable accessor:

```tsx
import { createRpcBinding } from "@nat-av/frontend-remix";

const rpcBinding = createRpcBinding<natav>();
export const { getRpc } = rpcBinding;

function Page(handle: Handle) {
  const rpc = getRpc(handle);
  const system = rpc.driver("system");

  rpc.on(system, "routeChanged", () => {
    void handle.update();
  });

  return () => <div>{system.state.ui.page}</div>;
}
```

`createRpcBinding()` must be synchronous and must not connect at module scope.
The returned `getRpc(handle)` is not permanently bound to one `RpcClient`:

- During SSR, Remix request middleware creates a request-local RPC client and
  stores it in request context. `getRpc(handle)` resolves that client.
- During browser bootstrap, the client entry creates a page-scoped client from
  the serialized SSR snapshot and installs it as the browser binding.
  `getRpc(handle)` then resolves that client.
- The component source is identical in both environments.
- The `handle` identifies the component lifecycle; it does not select the
  transport or environment.

Request context must never fall back to a module singleton during SSR.

## Setup And Render

Code before `return () => {}` is component setup, not server-only code. Remix
runs setup once for the server instance and once independently for the browser
instance. Setup-created functions are recreated during hydration; they are not
serialized from server to client.

The returned render function runs once during SSR, once during hydration, and
again for every client update:

```tsx
function RoomStatus(handle: Handle) {
  // Setup: once per SSR instance and once per browser instance.
  const rpc = getRpc(handle);
  const room = rpc.driver("roomos");

  function refresh() {
    return room.api.refresh();
  }

  rpc.on(room, "statusChanged", () => {
    void handle.update();
  });

  return () => {
    // Render: SSR and every client rerender.
    const state = room.state;

    return (
      <section>
        <p>{state.connected ? "Online" : "Offline"}</p>
        <p>{state.status}</p>
        <button type="button" mix={on("click", refresh)}>
          Refresh
        </button>
      </section>
    );
  };
}
```

Capturing the stable driver handle in setup is correct. Capturing `room.state`
in setup is also valid when an intentional initial snapshot is wanted, but it
must not be used for values that should update:

```tsx
function InitialStatus(handle: Handle) {
  const room = getRpc(handle).driver("roomos");
  const initialState = room.state;

  return () => <p>{initialState.status}</p>;
}
```

This follows normal Remix behavior. The package must not hide the distinction
with mutable state objects or implicit rerendering.

## Events

RPC events follow the lifecycle of other Remix external event sources:

- `rpc.driver(name).state` is readable during SSR.
- `rpc.driver(name).api.*` is available during SSR through the universal
  promise-shaped facade.
- `rpc.on(driver, event, callback)` is a component subscription.
- `rpc.on(...)` is inert during SSR and active after hydration.
- Browser subscriptions are installed through a browser lifecycle boundary and
  removed when `handle.signal` aborts.
- A subscription that resolves after abort must immediately unsubscribe.
- Transient events missed between SSR and hydration are not replayed.
- If an event affects rendered data, the driver must publish that durable
  effect through state.

The current Remix renderer gives SSR a non-live signal, makes `handle.update()`
unavailable, and makes `handle.queueTask()` a no-op. Event helpers must use
`queueTask()` as the browser-only boundary rather than relying on SSR cleanup
or checking browser globals.

## Render Consistency

Render functions must be synchronous and side-effect-free. This is invalid:

```tsx
return () => {
  const before = room.state;
  void room.api.setVolume(50);
  const after = room.state;
  return <p>{before.volume} / {after.volume}</p>;
};
```

The universal facade publishes immutable, revisioned snapshots. A render reads
one published snapshot; incoming WebSocket updates are queued for a later
render and cannot interleave with the current synchronous JavaScript call
stack. Bind the current state locally at the start of a render:

```tsx
return () => {
  const state = room.state;
  return <p>{state.status}</p>;
};
```

Universal component APIs are always promise-shaped because they may cross a
browser transport. After:

```tsx
await room.api.refresh();
```

the promise must resolve only after state through that API response's revision
watermark has been applied. It cannot include unrelated future timer updates.

## State Reconciliation

Treat SSR as snapshot A:

1. The server captures snapshot A.
2. The server renders HTML from A.
3. The response embeds A using `Rpc.Json`.
4. The browser installs A before hydration.
5. Hydration renders against A, preventing an initial mismatch.
6. WebSocket init provides current snapshot B.
7. The client reconciles A to B and updates affected components.
8. Later state replacements are accepted in revision order.

State updates should use full replacement initially, not shallow merge. Every
published update receives a monotonic revision. Initialization must be sent
before live updates for a peer; updates produced during initialization are
buffered and flushed afterward. Clients ignore stale revisions and recover
from revision gaps with a fresh snapshot.

API responses should include a state revision watermark. The browser resolves
the corresponding promise only after that revision has been applied. This
turns `await room.api.refresh()` into a useful synchronization boundary.

## Server-Native RPC

The universal facade cannot preserve native synchronous return types because
the browser transport is asynchronous. Expose a separate server-only accessor:

```ts
import { serverRpc } from "@nat-av/frontend-remix/server";

router.get("/room", async ({ request }) => {
  const rpc = serverRpc<natav>();
  const room = rpc.driver("roomos");

  const cached = room.api.readCachedStatus();
  await room.api.refresh();

  return render(<RoomStatus cached={cached} />, request);
});
```

`serverRpc()` is trusted and process-local. It preserves native sync/async
returns and performs no JSON serialization, loopback transport validation,
browser authorization, or WebSocket work. It resolves the current request's
manager/context and is unavailable from browser imports.

Server event waits should be request-scoped and abortable:

```ts
const status = await rpc.once(room, "statusChanged", {
  signal: request.signal,
});
```

If an event must affect initial HTML, await it through `serverRpc()` before
capturing the render snapshot. Component `rpc.on(...)` remains browser-only.

## Async SSR

Remix supports async server work around component rendering, but the current
component contract is synchronous. Setup must return a render function
synchronously, and render must return a `RemixNode` synchronously. Do not add
async component semantics in this package.

Use an async route/controller to prepare state first:

```ts
router.get("/room", async ({ request }) => {
  const rpc = serverRpc<natav>();
  await rpc.driver("roomos").api.refresh();

  // Capture the post-refresh snapshot before synchronous component rendering.
  return render(<RoomStatus />, request);
});
```

`renderToString()` and `renderToStream()` support async rendering work, and
frames can resolve promises or streams. Frames are finite HTTP boundaries, not
live driver-state synchronization. A frame may stream one render, but it does
not remain subscribed to driver changes. Live updates continue through
RPC/WebSocket state notifications and hydrated component rerenders.

Use frames only for independent HTTP render, fallback, or reload boundaries.

## Request Lifecycle

- Each document or frame request receives a distinct RPC client and synthetic
  server peer.
- The binding initializes before SSR accesses driver state.
- The request abort signal cancels pending server work.
- The synthetic peer closes when the response completes, errors, or is
  cancelled, removing subscriptions and pending work.
- Browser bootstrap installs the SSR snapshot before connecting WebSocket.
- Browser disposal closes the page-scoped binding.

## Package Responsibilities

- `@nat-av/core` owns transport-neutral RPC contracts, clients, immutable
  snapshots, revisions, response watermarks, and reconciliation.
- `@nat-av/rpc-ws` owns the Node/WebSocket server transport.
- `@nat-av/frontend-remix` owns request context, `getRpc`, hydration bootstrap,
  and component lifecycle integration.
- `@nat-av/frontend-remix/server` owns `serverRpc()` and abort-aware server
  event helpers.

## Implementation Order

1. Make universal API types always return `Promise<Awaited<R>>`.
2. Add immutable revisioned snapshots and full state replacement.
3. Add initialization buffering and API response watermarks.
4. Make `createRpcBinding()` synchronous and environment-resolving.
5. Add request-scoped Remix middleware and snapshot serialization.
6. Add browser hydration from snapshot A before WebSocket connection.
7. Add lifecycle-safe `rpc.on(...)` and automatic state update scheduling.
8. Add `serverRpc()` with native sync/async returns and `once(...)`.
9. Add concurrency, ordering, hydration, and request-abort tests.

## Independence

RPC groups do not block this plan. The SSR binding can initially serialize
named drivers only. Once groups exist, the same binding should serialize their
catalog paths and hydrate them through the existing cached driver handles.
Group implementation may therefore land before, after, or alongside SSR; only
the final catalog serialization test crosses both features.
