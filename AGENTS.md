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
- Move shared UI to `app/ui/`, not `app/controllers/`.

## Build-Out Notes

- This starter intentionally begins small; add directories like `app/data/`,
  `app/middleware/`, `public/`, and `test/` only when you need them.
- Prefer putting code in the narrowest owner before introducing shared modules.
- Avoid generic dumping-ground directories like `app/lib/` or
  `app/components/`.
- Even though all of the documentation uses `let` syntax for creating
  variables, you should prefer `const` instead unles the variable will be
  reassigned, obviously.

# Natav Library

The `./av/` directory is a vendored library called `nat-av`. Refer to
`.agents/Natav.md` for more information.
