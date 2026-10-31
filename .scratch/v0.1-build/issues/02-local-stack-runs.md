# 02: The local stack runs

**What to build:** On a developer machine, `pnpm dev` starts Postgres (Compose), core (Hono) and the hub (React, plain JSX + Tailwind) behind a dev proxy on `:3000` that routes `*.localhost`. Opening `hub.localhost` shows a hub page that has reached core. Core is the only process that touches the core schema, through its own role, and its migrate step runs before it starts.

**Blocked by:** 01

**Status:** done

- [x] One command starts Postgres, core and the hub, and stops them all on exit
- [x] The proxy routes `hub.localhost` and core's routes to each process's port
- [x] Core's tables live in their own schema reached through a role that can touch nothing else
- [x] Core migrates as a separate step before it starts, never at boot

**Decided (R, 2026-10-31):**

- Core answers on its own subdomain, `core.<domain>`. The proxy routes by host only, and core allows credentialed requests from the hub's and admin's origins.
- The dev runner and proxy live in a published `@robkit/dev` package with a `robkit-dev` bin. It can fold into the CLI once the CLI's name is settled.
- `robkit-dev` starts each `apps/<slug>` itself instead of `turbo dev`. The folder name is the subdomain and the runner assigns the port, so an app needs no dev config.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 03 onwards:

- Core's role can't run Drizzle's stock migrator. It starts with `CREATE SCHEMA IF NOT EXISTS`, and Postgres refuses that to a role without CREATE on the database even when the schema exists. `@robkit/core`'s `migrate` reads Drizzle's migration folder and keeps its journal table, `core.__drizzle_migrations`, but skips that statement. Apply core's migrations with it, not `drizzle-kit migrate`. The same applies to every Drizzle app template (tickets 07 and 10).
- `drizzle-kit` isn't set up yet. `packages/core/drizzle/meta/_journal.json` is an empty v7 journal. Ticket 03 adds drizzle-kit with `out: ./drizzle`, its tables in a `core` schema and `schemaFilter: ["core"]`, then generates the first migration.
- An app with a `migrate` script gets a schema and role named after its folder. Slugs must match `^[a-z][a-z0-9_]{0,62}$`, so a folder with a hyphen can't have a database. `robkit add` (ticket 10) needs to settle that.
- Postgres listens on host port 54320, because 5432 is often taken. Override it with `ROBKIT_POSTGRES_PORT`.
- App ports start one above the proxy's port (`ROBKIT_DEV_PORT`, default 3000) in slug order.
- `@robkit/dev` and `@robkit/core` export `.ts` source, which Node strips only outside `node_modules`. They need a build step before they're published.
- The runner always calls `pnpm run`. The package-manager table (ticket 18) changes that.
- Vite prints `http://127.0.0.1:<port>`, which shows nothing, since the hub only answers on `hub.<domain>`.
- postgres.js is pinned to 3.4.9. 4.0 is a new major and Drizzle 0.45 is built against 3.
