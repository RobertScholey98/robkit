# 09: `@robkit/drizzle`: the database and its migrations

**What to build:** Each of the four Node stacks carries the same 45-line `migrate.ts`, a copy of Drizzle's migrator changed to work inside the app's own schema, and a `database.ts` that reads `DATABASE_URL` through `@robkit/input`. That is platform logic in the owner's files, in four copies that can drift, and none of them takes a lock ([review](../research/review-2026-11-09.md), "Go and Node differ by accident"). It becomes a package.

- **The package.** `@robkit/drizzle`, a new published package, named for what it adapts as the stack adapters are. `drizzle-orm` and `postgres` are peer dependencies, so the app's own copies are the ones in use. In a linked install the package loads from the checkout, which has its own copy of `drizzle-orm`; confirm early that an app's schema still works with it, at run time and under `tsc`, and say what you found. If it doesn't, stop and ask before you change the shape of the call below. It has the published-package shape: README, `api-report.md`, an entry in `tooling/eslint/package-graph.js`, a changeset, coverage thresholds, and the pack check. `pnpm new:package` starts one.
- **The database.** `appDatabase(schema)` returns a function that gives the app's Drizzle database, as the app's own role, connected on first call from `DATABASE_URL`. An app writes:

  ```ts nocheck
  import { appDatabase } from "@robkit/drizzle";
  import * as schema from "./schema.ts";

  export const database = appDatabase(schema);
  ```

  It takes postgres.js options as a second argument, with today's `max: 2` as the default. A missing or malformed `DATABASE_URL` fails on first call with the reader's message, never when the module loads: `next build` imports an app's modules with no database set. Today's `database.ts` exits the process there. Say whether the package exits or throws, following `docs/conventions/errors.md`, and record the choice.
- **One pool, and the schema as it now is.** Under a dev server that reloads modules, it keeps one pool, the postgres.js client, and doesn't open another on each reload. It builds the Drizzle database again from the schema it is handed, because Drizzle reads the schema when the database is made. So a table the owner adds to `schema.ts` is there on the next request, with no restart.
- **Migrations.** A `robkit-migrate` command applies the migrations that haven't run. It reads them from the app's `drizzle` folder, or from a folder given as its argument, since `drizzle.config.ts` lets an owner move `out`. It keeps today's behaviour: the journal table sits in the app's schema, and nothing creates a schema. Its journal stays the one today's `migrate.ts` writes, so an app that already migrated carries on. An app's `migrate` script becomes `robkit-migrate`. The command runs through `runCommand` from `@robkit/input/command`, where ticket 12 put it.
- **Two runs don't both migrate.** Two containers can start together. The migrator locks the journal table inside the migrating transaction, as ticket 12 does for core and the Go stack's migrator does for itself, and tries again if two runs race to create the table. The lock is not an advisory one: any role in the shared database can take any advisory key, so one app could stall another's migration. Only the app's own role can lock a table in its schema.
- **Core uses the same migrator.** Core's `migrateFrom` (`packages/core/src/migrate.ts`) is the same algorithm as the apps' `migrate.ts`, with the lock ticket 12 gave it. Two locking migrators would drift as the four copies did. Core moves onto this package's migrator, with its schema and folder passed in. `@robkit/core` gains a runtime edge to `@robkit/drizzle`, which makes no cycle.
- **Templates.** The four Node stacks lose `src/migrate.ts`, and their `database.ts` becomes the three lines above. `drizzle.config.ts`, `schema.ts` and `drizzle/` stay the app's own. The Go stack is untouched: it owns its database.
- **Docs.** Each Node stack's `AGENTS.md` database section, the install's root `AGENTS.md`, and the new README.

**Blocked by:** 08, 12

**Status:** ready-for-agent

- [ ] `appDatabase(schema)` connects on first call as the app's role, and its queries land in the app's schema
- [ ] Importing a module that calls `appDatabase` with no `DATABASE_URL` set doesn't fail; the first call does
- [ ] Reloading the module that calls `appDatabase` many times leaves one pool open, and a table added to the schema between reloads can be queried after the next one
- [ ] `robkit-migrate` applies new migrations, changes nothing on a second run, and works on a database the old `migrate.ts` already migrated
- [ ] `robkit-migrate` given a folder reads its migrations from there
- [ ] Two `robkit-migrate` runs started together, on a schema with no journal yet, both succeed, and each migration runs once
- [ ] While a migration runs, `pg_locks` shows no advisory lock
- [ ] Core migrates through this package's migrator, and ticket 12's test of two cores starting together still passes
- [ ] A missing `DATABASE_URL` fails with the reader's message, in both the command and `appDatabase`
- [ ] No Node stack has a `src/migrate.ts`, and each `database.ts` imports only `@robkit/drizzle` and its schema
- [ ] The whole-stack and production tests pass for every stack, with each app migrating through `robkit-migrate`
- [ ] The package has its README, API report, graph entry, changeset and thresholds
- [ ] The PR's CI `gate` job passes on GitHub
