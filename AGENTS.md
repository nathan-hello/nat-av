# Remix Agent Guide

## Commands

`npm install` `npm run start` `npm test` `npm run typecheck`

## Building Remix Features

Refer to ./agents/skills/remix/SKILL.md for all changes in the
app/ folder.

## Route Ownership

- Start from `app/routes.ts` and map each route to the narrowest owner on disk.
- Promote a route into a controller folder with `controller.tsx` only when it
  gains nested routes, multiple actions, or route-owned modules.
- Keep route-owned page modules next to the route that owns them.
- This application is mostly an SPA, so not using the Remix3 SSR primatives.
- Pages are loaded in `app/spa` and use `app/ui` for shared libraries and UI
  primatives. This includes the `app/ui/av` folder, which is used for colocating
  Remix3 components meant for the `av/` framework. It heavily uses the RPC layer
  for rendering state and mutating state. It is not using data loaders and fetchers.
  It is a persistent websocket.

## Build-Out Notes


# Natav Library

The `./av/` directory is a vendored library called `nat-av`. Refer to
`.agents/Natav.md` for more information.

## Rules

- Whenever creating a Typescript assertion by using the `as` keyword, you must
  add a `// TSAS: ` comment above the assertion explaining why the assertion
  exists. This comment should only be one line of text, even after `prettier`
  formats the code. You should refrain from using assertions unless

  - It is something that is unknowable from the Typescript compiler and we are
    100% confident that the assertion will be valid by the time it will become
    necessary. For example, we might initialize a class variable with a default
    value but we are 100% of the time going to instantiate it properly, so we
    use `as Type`. If you use an assertion for this reason, describe in the
    comment where exactly the guarantee of runtime-typesafety is coming from.
    Keep this comment short: only one line of text.
  
  - It is a situation where if we were to make it typesafe then it would
    explode the complexity of the type system for a small amount of gain. This
    project has a lot of Typescript code just for the end to end RPC
    typesafety. If you're reaching for a complex type, it likely already
    exists. If such a type would make the complicated type system even more
    complex, then you may use `as`. If you use an assertion for this reason,
    describe in the comment why it would be complicated. It is a comment so
    keep it short: only one of text.

- All imports use either the `@/` or `@av/` aliases. Do not ever use relative
  paths to import a file.

- The `System` class in `av/system.ts` is not meant for whatever system apis I
  might want exposed. Its purpose is for a real-world application holding
  internal state that is not related to any particular device. Do not add any APIs
  or state to this class unless otherwise specified. 
