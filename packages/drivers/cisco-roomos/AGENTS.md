# RoomOS Agent Guide

## Purpose

The RoomOS type system exists to make three surfaces line up with the Cisco
schema:

- generated command, configuration, status, and feedback APIs
- runtime state access through `roomos.state`
- event listeners through `roomos.events.on(...)`

The generated types should describe the schema in a way that is easy to read,
easy to regenerate, and strict enough that incorrect RoomOS paths fail at
compile time.

## State Shape

`roomos.state` should expose only these public roots:

- `xConfiguration`
- `xStatus`
- `xFeedback`
- `internal`

Do not expose parallel `Configuration`, `Status`, or `Event` roots in the
public type surface.

## Event Names

`roomos.events.on(...)` should use RoomOS event `normPath` strings.

Examples:

- `"Bluetooth Streaming PlaybackPosition"`
- `"PresentationPreviewStarted"`
- `"UserInterface ScreenShotStored"`

The payload type for each event name must match the event object at that
`normPath`, not a nested leaf value.

## Subscription Tree

The RoomOS subscriptions object should be rooted at the public state roots:

- `xConfiguration`
- `xStatus`
- `xFeedback`

`xFeedback` is the event subscription tree and should use RoomOS event
`normPath` strings beneath that root.

Examples:

- `{ xFeedback: { Bluetooth: true } }`
- `{ xFeedback: { Bluetooth: { Streaming: true } } }`
- `{ xFeedback: { Bluetooth: { Streaming: { PlaybackPosition: true } } } }`

Rules:

- allow subscribing at any level above a `normPath` within `xFeedback`
- stop the tree at `normPath` boundaries
- do not allow subscribing to payload fields inside a `normPath`
- `roomos.events.on(...)` autocomplete should be limited to the event names
  permitted by `subscriptions.xFeedback`

## Generator Expectations

When updating `typegen/scripts/`:

- prefer emitting explicit generated helper types over clever runtime-side
  inference
- keep the generated output legible and documented where it defines important
  public behavior
- preserve a clear distinction between event path containers and event payload
  objects
- favor schema-derived `normPath` metadata for event listener names
