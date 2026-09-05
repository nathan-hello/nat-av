# REPL Plan

## Goal

Provide a small reusable terminal loop that package authors can use to build
package-specific REPLs without forcing domain behavior, schemas, or UI
decisions into `@nat-av/core`.

The decoder REPL, Dante REPL, schema tooling, and future tools are independent
consumers. They may use the same low-level REPL helper, but they do not need to
share a command model or a common domain abstraction.

## Core Abstraction

The reusable helper should be named `createRepl` and should accept a mapping
from command names to textual callbacks:

```ts
type ReplCommand = (
  args: string[],
) => string | void | Promise<string | void>;

type ReplCommands = Record<string, ReplCommand>;
```

The intended call-site formatting is:

```ts
const repl = createRepl({
  prompt: "decoder> ",
  commands: {
    list: () => {
      return "...";
    },
    route: async (args) => {
      return "...";
    },
  },
});
```

Use arrow-function properties in command maps:

```ts
commands: { list: () => {} }
```

Do not use method shorthand:

```ts
commands: { list() {} }
```

## Responsibilities

`createRepl` owns only terminal mechanics:

- stdin and stdout handling;
- prompting;
- command-line tokenization, including quoted arguments;
- dispatching the command by name;
- awaiting asynchronous callbacks;
- printing returned strings;
- formatting thrown errors;
- built-in `help`;
- built-in `exit` and `quit`;
- cleanup and controlled shutdown.

Command callbacks own everything domain-specific:

- argument parsing and validation;
- encoder/device/resource lookup;
- driver API calls;
- output formatting beyond returned text;
- command-specific help and usage text;
- lifecycle setup and teardown for the domain resource;
- any special interactive behavior required by the package.

The REPL helper must not own schemas, generated API metadata, structured
arguments, driver lifecycle, GUI concerns, completions, or domain-specific
rendering.

## API Shape

Prefer returning a controllable object rather than starting I/O inside
`createRepl`:

```ts
export interface Repl {
  run(): Promise<void>;
  close(): void;
}

export function createRepl(options: {
  prompt: string;
  commands: ReplCommands;
}): Repl;
```

Returning `Repl` keeps construction separate from execution, supports tests,
and lets callers close the interface without calling `process.exit()` from
reusable package code.

If the implementation demonstrates that a lifecycle object provides no value,
the fallback API may be a function returned by `createRepl`:

```ts
const run = createRepl({ prompt: "decoder> ", commands });
await run();
```

The lifecycle-object form is preferred because driver commands commonly need
socket cleanup and tests need deterministic shutdown.

## Package Usage

Each package may expose its own typed convenience function or factory. The
package supplies application-specific values through closure or options, while
the callbacks retain complete control of the UX:

```ts
export function createDecoderRepl(options: {
  decoder: Decoder;
  encoders: readonly Encoder[];
}) {
  return createRepl({
    prompt: "decoder> ",
    commands: {
      list: () => {
        return options.encoders
          .map((encoder, index) => `${index}: ${encoder.name}`)
          .join("\n");
      },
      route: async (args) => {
        // Decoder-specific parsing, validation, and UX live here.
        await routeDecoder(options.decoder, options.encoders, args);
        return "Routed";
      },
    },
  });
}
```

A user-owned script can then compose and run the package tool:

```ts
import { createDecoderRepl } from "@nat-av/driver-decoder/repl";
import { decoder, encoders } from "./config.js";

const repl = createDecoderRepl({ decoder, encoders });
await repl.run();
```

The package should not require users to invoke an internal script by path with
`tsx`. User-owned TypeScript entrypoints are the composition boundary.

## Schema Relationship

The schema generator is independent from the REPL abstraction. It describes
TypeScript APIs for schema consumers such as OpenAPI and binding generators.
It does not define the decoder REPL and should not be used as the decoder
REPL's command model.

A future schema-generated REPL may use `createRepl`, but that is an optional
consumer. A driver can provide a hand-written REPL when inferred schemas do not
provide enough information for good UX. The hand-written REPL may implement
fuzzy lookup, tables, prompts, resource-specific validation, or other behavior
that cannot be inferred from TypeScript types.

## Future `createScript`

Do not build a generic scripting abstraction now. A future `createScript` may
accept a compatible callback map for non-interactive execution, but it should
be designed only after a real use case exists. Do not introduce a shared
controller, command registry, GUI model, or schema replacement in order to
anticipate that use case.

If `createRepl` and a future `createScript` eventually share stable mechanics,
extract only that demonstrated common code. Keep the public package-specific
callbacks and UX independent.

## Implementation Order

1. Add a small `createRepl` implementation in the appropriate Node-facing
   package export.
2. Add focused tests for tokenization, dispatch, async results, errors, help,
   exit, and cleanup.
3. Convert the decoder REPL to an exported package function that accepts its
   decoder and encoder data.
4. Convert the Dante REPL similarly if the shared helper is useful there.
5. Remove package-internal assumptions about command-line arguments and
   construction data.
6. Leave schema generation as a separate exported library function and keep
   generated-schema consumers independent from the REPL implementation.
