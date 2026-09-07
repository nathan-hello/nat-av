# Workspace Migration Plan

1. Convert the repository root into a private pnpm workspace.

2. Add shared TypeScript configuration for workspace packages while preserving
   the existing strict compiler settings.

3. Create the package layout:
   - `packages/core` as `@nat-av/core`, retaining the current `lib/` source code as core internals
   - `packages/drivers` as the aggregate `@nat-av/drivers` package
   - `packages/drivers/<name>` as independently installable driver packages
   - `packages/plugins` as the aggregate `@nat-av/plugins` package
   - `packages/plugins/<name>` as independently installable plugin packages

4. Move the current core, driver, plugin, and test code into the corresponding
   package boundaries without creating a separate `lib` package or renaming
   `Manager.plugin` yet.

5. Keep the shared RPC types and implementation under `packages/core/rpc` so
   core event types do not depend on an RPC plugin.

6. Remove Remix dependencies from reusable packages and keep Remix dependencies
in the application examples.

7. Add TypeScript-based package builds that emit JavaScript and declarations,
using package-specific build scripts for generated schema/runtime assets where
required.

8. Keep the Git-submodule source workflow build-free by adding
`examples/remix/git-submodule/` with TypeScript and Vite aliases pointing to
`vendor/nat-av/packages/*/src`.

9. Add `examples/remix/complete/` as the complete control-processor example;
   it consumes the workspace packages directly and verifies its TypeScript
   build.

10. Add workspace scripts for typechecking, building, testing, schema
 generation, and example verification.

11. Add package-boundary guidance to `AGENTS.md`, including the
single-runtime-copy requirement for `@nat-av/core` and the prohibition on
bundling core into drivers or plugins.

12. Run typechecking, tests, package builds, schema validation, and both Remix
example verification workflows.
