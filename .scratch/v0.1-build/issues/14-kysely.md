# 14: Kysely

**What to build:** Choosing Kysely at init produces an install where both stacks' apps use Kysely end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook, and core keeps Drizzle internally.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] A fresh install with Kysely passes the guest journey and `robkit add` for both stacks
- [ ] Kysely's migrate command runs as the app's pre-start step locally and as its pre-deploy step, following ticket 11's notes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from ticket 12:

- **The app's AGENTS.md.** Each app's `AGENTS.md` ends with the ORM's section, `templates/orms/<orm>/AGENTS.md`, which the choice table names as the option's `appGuide`. Write `orms/kysely/AGENTS.md`, as ticket 13 does for Prisma.

Notes from ticket 13:

- **The ORM layer.** Add Kysely to the choice table with an `appLayer`, `templates/orms/kysely/app`, laid over every app. It must give `package.json` a `migrate` script and dependencies, and `src/visits.ts` exporting `recordVisit(viewerId: string): Promise<number>`, which both stacks import. `src/database.ts` holds the connection. Drizzle's and Prisma's layers show the shape. Flip `comingLater` to the layer, and the usage text, wizard and choice tests pick it up.
- **The app's schema.** The role has its schema first on its search path, so unqualified tables land there. Never `CREATE SCHEMA` in a migration: the role may not, even when the schema exists. If Kysely's `Migrator` keeps its tables in a named schema, point `migrationTableSchema` at the slug or leave it unqualified.
- **Install scripts.** If a dependency has an install script, name it in the option's `builds`, or pnpm 11 refuses the install.
- **Tests.** Add the install to `installChoices` in `tooling/e2e/src/install.ts`, with a suite like `prisma.test.ts`, and to `installs` in `production.test.ts`.
