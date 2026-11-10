# 0016: Platform wiring lives in packages

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decisions 8 to 11), and built by tickets [09](../../.scratch/just-use-it/issues/09-drizzle-package.md), [10](../../.scratch/just-use-it/issues/10-dev-and-build-wiring.md), [11](../../.scratch/just-use-it/issues/11-serve-in-each-adapter.md) and [12](../../.scratch/just-use-it/issues/12-core-is-one-command.md), 2026-11-10. What each build chose awaits R's review.

## Context

An app is copied into an install and owned there, and only the packages update ([0008](0008-packages-update-apps-are-owned.md)). Yet every Node app carried robkit's own code: a 45-line migrator, a `serve.ts`, and a Vite or Next config that read robkit's settings through `@robkit/input`. `apps/core` had three source files. An owner read all of it before finding their own code, and a fix to any of it reached only installs made after the fix.

## Decision

What every app does the same way lives in a package, and the app calls it in a line or two.

- **`@robkit/drizzle`** gives an app its database with `appDatabase`, and its `robkit-migrate` command applies the app's migrations in its own schema, under a lock on its own journal table. Core migrates through the same migrator. The app keeps its schema, `drizzle.config.ts` and its migrations.
- **`@robkit/vite`** holds what robkit adds to Vite: `robkit()`, which sets the dev server up behind the proxy, and `@robkit/vite/express` for an Express app. An app lists it under `devDependencies`, and no package an app runs in production names Vite. `@robkit/next` ships `withRobkit()` for `next.config.ts`.
- **`@robkit/serve`** is what every server does the same way: read the address, listen, serve the client's files, and stop on SIGTERM. Each Node adapter's `/serve` entry builds `serve()` on it, and the app's `serve.ts` is three lines, so the owner can put code before the call. The hub uses its `servePage()`, and core serves through it too.
- **Each adapter's `/testing` entry** builds viewers for a test, with builders written once in `@robkit/guard/testing`. The main entry has no way to skip the guard.
- **`robkit-core`**, the bin of `@robkit/core`, provisions, migrates and serves. `apps/core` is a `package.json` with no source.

## Consequences

- A fix to the migrator, the dev wiring or the server reaches every install by a version bump.
- An app's files are its own: routes, schema, migrations and settings. The PRD's "An app's files" shows a React + Hono app after the change.
- `tooling/repo-checks` holds two checks that keep it this way: `vite-stays-out.test.ts`, and `headers-in-one-place.test.ts` for the header values in `@robkit/input/headers`.
- Provisioning moved to a package of its own as part of this: [0017](0017-provisioning-is-its-own-package.md).
