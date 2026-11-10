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

**Status:** done

- [x] `appDatabase(schema)` connects on first call as the app's role, and its queries land in the app's schema
- [x] Importing a module that calls `appDatabase` with no `DATABASE_URL` set doesn't fail; the first call does
- [x] Reloading the module that calls `appDatabase` many times leaves one pool open, and a table added to the schema between reloads can be queried after the next one
- [x] `robkit-migrate` applies new migrations, changes nothing on a second run, and works on a database the old `migrate.ts` already migrated
- [x] `robkit-migrate` given a folder reads its migrations from there
- [x] Two `robkit-migrate` runs started together, on a schema with no journal yet, both succeed, and each migration runs once
- [x] While a migration runs, `pg_locks` shows no advisory lock
- [x] Core migrates through this package's migrator, and ticket 12's test of two cores starting together still passes
- [x] A missing `DATABASE_URL` fails with the reader's message, in both the command and `appDatabase`
- [x] No Node stack has a `src/migrate.ts`, and each `database.ts` imports only `@robkit/drizzle` and its schema
- [x] The whole-stack and production tests pass for every stack, with each app migrating through `robkit-migrate`
- [x] The package has its README, API report, graph entry, changeset and thresholds
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From ticket 12's build, added by the lead

Two runs that race to create a journal table get one of at least three errors from Postgres: `42P07`, `42710` for the table's row type, or `23505` on a catalog index. Ticket 12's worker listed two, and CI met the third. So core's `createJournal` (`packages/core/src/migrate.ts`) sorts none of them. When its create is refused it looks in `pg_tables`, and goes on if the table is there. Postgres gives each of these errors only after the winning run has committed, so the look is safe. Look in `pg_tables`, not with `to_regclass`, which also finds a type or a view of that name.

Do the same in this ticket's migrator, with a test that fails the create for another reason and expects Postgres's own error. The Go stack's `migrate.go` creates its journal with no answer to this race. Give it the same one here, since this ticket already holds the two migrators to one behaviour.

### Chosen in the build

- **`appDatabase` ends the process; `robkit-migrate` throws.** A missing or malformed `DATABASE_URL` makes `appDatabase`'s first call print the reader's message and exit 1 through `orExit`. `errors.md` says an app server reads its settings that way, and `guarded()` does the same. `robkit-migrate` is a command, so it throws the problem as a `CommandProblem` and `runCommand` prints it alone. `errors.md` says both now.
- **The pools live on `globalThis`**, in a map keyed by `DATABASE_URL`, under `Symbol.for("@robkit/drizzle pools")`. A dev server can load the package again as well as the app's modules, so module state alone isn't enough: a test that loads the package five times saw five pools before, one after. The options passed when the pool opens win; a reload with other options keeps the open pool.
- **`appDatabase(schema, options?)` returns `() => AppDatabase<TSchema>`**, the Drizzle database with `$client`, so `visits.ts` stays as it was. `options` are postgres.js's, over `{ max: 2 }`.
- **The migrator is `migrate({ databaseUrl, folder, schema? })`.** Without `schema` it keeps the journal in `current_schema()`, which is where the old `src/migrate.ts` put it for an app's role. Core passes `schema: "core"`. A role with no schema on its search path gets an error naming the role and the path.
- **`robkit-migrate [folder]`** reads `drizzle` from the folder it runs in when it names none, prints usage for more than one argument or one starting with `-`, and refuses a folder with no `meta/_journal.json`, naming it and saying to run `pnpm db:generate` or pass `out`'s folder. It prints `migrated`, as the old script did.
- **Go's test runs from the e2e suite.** The Go template's tests have no database, so `tooling/e2e/src/go-migrate.test.ts` builds the `go` install's example and runs `server migrate` against its own Postgres. Its race test forces the order: another session creates `schema_migrations` and holds its transaction open until the migrator waits on it. Before the fix it failed with `23505` on `pg_type_typname_nsp_index`.
- **Core's function coverage** fell under its threshold once the migrator's functions moved out. A new test covers core's notice handler, which nothing tested, rather than lowering the threshold.
- **`drizzle-orm` is a dev dependency of repo-checks**, so the README's example compiles, and `knip.jsonc` says why, as it does for `hono`.

### The linked install, checked early

In a linked install (`create-robkit --link --install --stack react-hono`), `@robkit/drizzle` loads the checkout's `drizzle-orm` (`~/robkit-jui-09/node_modules/.pnpm/drizzle-orm@0.45.4_postgres@3.4.9`) and the app loads its own (`<install>/node_modules/.pnpm/drizzle-orm@0.45.4_postgres@3.4.9`). With the template's three-line `database.ts`, `tsc` passed, and against a real Postgres an insert, a typed `select ... where eq(...)` and the relational `database().query.visit.findMany()` all worked. So the call keeps the ticket's shape. A packed install's `tsc` I didn't run by hand; the production test builds every stack from `robkit vendor`'s tarballs.

### For tickets 10 and 11

- **Ticket 10.** Nothing in `@robkit/drizzle` reads Vite or Next. Next's `next.config.ts` still adds the linked checkout as a Turbopack root, which is how it reaches `@robkit/drizzle` and its `drizzle-orm` in a linked install. Keep that when `withRobkit()` replaces the config.
- **Ticket 11.** An app's pool is `database().$client`. A `serve()` that stops on SIGTERM can end it there, as core's `onStopped` closes core's database. `@robkit/drizzle` doesn't end it itself. Each stack's `start` script is still `node --run migrate && node <serve>`, and `migrate` is `robkit-migrate`, from the app's `node_modules/.bin`.
- Every Node stack's `package.json` still names `@robkit/input`, for `serve.ts` and the Vite and Next configs. `postgres` stays in `dependencies` as `@robkit/drizzle`'s peer, though no app file imports it.

### Merged

Added by the lead. PR 86 merged into `m2-an-apps-files` on 2026-11-10, with `gate`, `check`, `production` and `pull-request` green on `d7cb836`.
