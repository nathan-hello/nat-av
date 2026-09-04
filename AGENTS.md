# Workspace Agent Guide

## Commands

`pnpm install` `pnpm run dev` `pnpm run test` `pnpm run typecheck`

## Building Remix Features

Refer to `.agents/skills/remix/SKILL.md` for changes in an example Remix app.

# Natav Packages

The reusable packages live under `packages/`. `@nat-av/core` owns the runtime
and retains its internal `lib/` source directory. Device drivers live under
`packages/drivers/`, and manager plugins live under `packages/plugins/`.
Examples are applications and must not become dependencies of reusable
packages.

## Rules

### TSAS comments for Typescript assertions

Whenever creating a Typescript assertion by using the `as` keyword, you must
add a `// TSAS: ` comment above the assertion explaining why the assertion
exists. This comment should only be one line of text, even after `prettier`
formats the code. You should refrain from using assertions unless

- It is something that is unknowable from the Typescript compiler and we are
  100% confident that the assertion will be valid by the time it will become
  necessary. For example, we might initialize a class variable with a default
  value but we are 100% of the time going to instantiate it properly, so we use
  `as Type`. If you use an assertion for this reason, describe in the comment
  where exactly the guarantee of runtime-typesafety is coming from. Keep this
  comment short: only one line of text.

- It is a situation where if we were to make it typesafe then it would explode
  the complexity of the type system for a small amount of gain. This project
  has a lot of Typescript code just for the end to end RPC typesafety. If
  you're reaching for a complex type, it likely already exists. If such a type
  would make the complicated type system even more complex, then you may use
  `as`. If you use an assertion for this reason, describe in the comment why it
  would be complicated. It is a comment so keep it short: only one of text.

The assertion `as const` is an exception to this rule because it does not
lessen any typescript compiler guarantees.

### Importing via alias vs relative path

Use real package names for package-to-package imports, such as
`@nat-av/core` or `@nat-av/core/rpc/server`. Use relative paths for modules
inside the same package when that makes the package independently portable.

The Git-submodule example may add TypeScript and Vite aliases that resolve
`@nat-av/*` package names to `vendor/nat-av/packages/*/src`.

### Package Runtime Identity

`@nat-av/core` must resolve to one runtime copy whenever possible. Do not
bundle core into a driver or plugin. Drivers and plugins should declare core
as a peer dependency and use a compatible version range.

Do not rely on `instanceof` across package boundaries unless the package graph
guarantees that both values use the same physical core package copy. Duplicate
installations create distinct JavaScript class identities even when the
source is identical. Packed-package tests must cover this boundary.

Drivers and plugins may use core capabilities, but must not import concrete
drivers or plugins from one another. Put shared contracts in core.
