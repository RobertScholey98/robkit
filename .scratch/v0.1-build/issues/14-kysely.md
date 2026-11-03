# 14: Kysely

**What to build:** Choosing Kysely at init produces an install where both stacks' apps use Kysely end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook, and core keeps Drizzle internally.

**Blocked by:** 11

**Status:** done

- [x] A fresh install with Kysely passes the guest journey and `robkit add` for both stacks
- [x] Kysely's migrate command runs as the app's pre-start step locally and as its pre-deploy step, following ticket 11's notes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from ticket 12:

- **The app's AGENTS.md.** Each app's `AGENTS.md` ends with the ORM's section, `templates/orms/<orm>/AGENTS.md`, which the choice table names as the option's `appGuide`. Write `orms/kysely/AGENTS.md`, as ticket 13 does for Prisma.

Notes from ticket 13:

- **The ORM layer.** Add Kysely to the choice table with an `appLayer`, `templates/orms/kysely/app`, laid over every app. It must give `package.json` a `migrate` script and dependencies, and `src/visits.ts` exporting `recordVisit(viewerId: string): Promise<number>`, which both stacks import. `src/database.ts` holds the connection. Drizzle's and Prisma's layers show the shape. Flip `comingLater` to the layer, and the usage text, wizard and choice tests pick it up.
- **The app's schema.** The role has its schema first on its search path, so unqualified tables land there. Never `CREATE SCHEMA` in a migration: the role may not, even when the schema exists. If Kysely's `Migrator` keeps its tables in a named schema, point `migrationTableSchema` at the slug or leave it unqualified.
- **Install scripts.** If a dependency has an install script, name it in the option's `builds`, or pnpm 11 refuses the install.
- **Tests.** Add the install to `installChoices` in `tooling/e2e/src/install.ts`, with a suite like `prisma.test.ts`, and to `installs` in `production.test.ts`.

Notes from building ticket 14:

- **Kysely.** Kysely 0.29.8 over `pg`, through the same layer as Drizzle and Prisma: `templates/orms/kysely/app`. Chosen in the build, awaiting R's review:
  - Migrations are code, one file each in `src/migrations`, listed in `src/migrations/index.ts`, rather than read from a folder at run time. Kysely has no migration generator, so the owner writes each one and updates `src/schema.ts`, the tables' types, to match.
  - The migrator imports from `kysely/migration`, where 0.29 moved it.
  - Kysely's migrator looks for its own tables by name in every schema, so with two Kysely apps the second would find the first's `kysely_migration`, skip creating its own, and fail. `src/migrate.ts` sets `migrationTableSchema` to the role's `current_schema()`, the app's own. It exists, so the migrator creates no schema. This comes from reading Kysely's source; the Kysely install, whose two apps are both on Kysely, passes with it.
- **Tests.** The whole-stack test adds a fourth install, on Kysely: a Start example and a React + Hono app from `robkit add`. It runs every journey but the role one, and passes its own CI workflow's steps, as the Prisma install does. `pnpm test:production` deploys it too, so the production run is now about nine minutes for three installs.
- The choice and wizard tests used Kysely as the option coming later. They now use bun.
