# Remix Agent Guide

## Commands

`npm install` `npm run start` `npm test` `npm run typecheck`

## Building Remix Features

Refer to ./agents/skills/remix/SKILL.md for all changes in the app/ folder.

# Natav Library

The `./vendor/av/` directory is a vendored library called `nat-av`. Refer to
`.agents/Natav.md` for more information.

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

For files with `vendor/av`, use the path from the alias, such as
`@av/rpc/client` or `@av/telemetry/server/exporters`.

When importing from the `vendor/av` folder into another folder, such as `app`,
or `vendor/drivers`, you should always import either `@av/client` or
`@av/index` if importing into a file that will never be ran on client.

For files within `vendor/drivers`, use relative paths for imports that are
local to that driver and `@av/index` for everything else. `@av/index` has
access to all of the apis that a driver will need. The reason why relative
imports here are okay is because we are prioritizing the portability of
folders wtihin the `vendor/drivers` folder.
