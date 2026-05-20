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
