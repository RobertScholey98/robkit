# 09: `@robkit/drizzle`: the database and its migrations

**What to build:** Each of the four Node stacks carries the same 45-line `migrate.ts`, a copy of Drizzle's migrator changed to work inside the app's own schema, and a `database.ts` that reads `DATABASE_URL` through `@robkit/input`. That is platform logic in the owner's files, in four copies that can drift, and none of them takes a lock ([review](../research/review-2026-11-09.md), "Go and Node differ by accident"). It becomes a package.

- **The package.** `@robkit/drizzle`, a new published package, named for what it adapts as the stack adapters are. `drizzle-orm` and `postgres` are peer dependencies, so the app's own copies are the ones in use. In a linked install the package loads from the checkout, which has its own copy of `drizzle-orm`; confirm early that an app's schema still works with it, and say what you found. It has the published-package shape: README, `api-report.md`, an entry in `tooling/eslint/package-graph.js`, a changeset, coverage thresholds, and the pack check. `pnpm new:package` starts one.
- **The database.** `appDatabase(schema)` returns a function that gives the app's Drizzle database, as the app's own role, connected on first call from `DATABASE_URL`. An app writes:

  ```ts nocheck
  import { appDatabase } from "@robkit/drizzle";
  import * as schema from "./schema.ts";

  export const database = appDatabase(schema);
  ```

  It takes postgres.js options as a second argument, with today's `max: 2` as the default. A missing or malformed `DATABASE_URL` fails on first call with the reader's message. Under a dev server that reloads modules, it keeps one pool and doesn't open another on each reload.
- **Migrations.** A `robkit-migrate` command applies the migrations in the app's `drizzle` folder that haven't run. It keeps today's behaviour: the journal table sits in the app's schema, and nothing creates a schema. It takes an advisory lock before it touches the journal, so two containers starting together don't both migrate. Its journal stays the one today's `migrate.ts` writes, so an app that already migrated carries on. An app's `migrate` script becomes `robkit-migrate`.
- **Templates.** The four Node stacks lose `src/migrate.ts`, and their `database.ts` becomes the three lines above. `drizzle.config.ts`, `schema.ts` and `drizzle/` stay the app's own. The Go stack is untouched: it owns its database.
- **Docs.** Each Node stack's `AGENTS.md` database section, the install's root `AGENTS.md`, and the new README.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] `appDatabase(schema)` connects on first call as the app's role, and its queries land in the app's schema
- [ ] Reloading the module that calls `appDatabase` many times leaves one pool open
- [ ] `robkit-migrate` applies new migrations, changes nothing on a second run, and works on a database the old `migrate.ts` already migrated
- [ ] Two `robkit-migrate` runs started together both succeed, and each migration runs once
- [ ] A missing `DATABASE_URL` fails with the reader's message, in both the command and `appDatabase`
- [ ] No Node stack has a `src/migrate.ts`, and each `database.ts` imports only `@robkit/drizzle` and its schema
- [ ] The whole-stack and production tests pass for every stack, with each app migrating through `robkit-migrate`
- [ ] The package has its README, API report, graph entry, changeset and thresholds
- [ ] The PR's CI `gate` job passes on GitHub
