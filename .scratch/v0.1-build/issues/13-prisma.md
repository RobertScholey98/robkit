# 13: Prisma

**What to build:** Choosing Prisma at init produces an install where both stacks' apps use Prisma end to end: schema, migrate step and queries. The platform contract stays `DATABASE_URL`, a schema and a migrate hook, and core keeps Drizzle internally.

**Blocked by:** 11

**Status:** done

- [x] A fresh install with Prisma passes the guest journey and `robkit add` for both stacks
- [x] Prisma's migrate command runs as the app's pre-start step locally and as its pre-deploy step, following ticket 11's notes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished ticket 08, which was deleted once done:

- `robkit.json` records `orm: "drizzle"`, but there is no Drizzle layer. Core keeps Drizzle inside `@robkit/core`, and the example apps query Postgres with `postgres` directly. Put the example apps on Drizzle first, so Prisma has something to replace.

Notes from ticket 12:

- **The app's AGENTS.md.** Each app's `AGENTS.md` ends with the ORM's section, `templates/orms/<orm>/AGENTS.md`, which the choice table names as the option's `appGuide`. Write `orms/prisma/AGENTS.md` on reading and migrating with Prisma, and the stack sections stay as they are. Drizzle's section describes today's apps, which query with `postgres`; when the example apps move to Drizzle, rewrite it too.

## Comments

- **Drizzle first.** The example apps were on `postgres`, so this ticket moved them onto Drizzle before adding Prisma. Each ORM option now names an `appLayer`, `templates/orms/<orm>/app`, which `stackTemplate` lays over the stack: the schema, migrations, `migrate` script, `src/database.ts` and the example's `src/visits.ts`. Both stacks import `recordVisit(viewerId)` from `src/visits.ts`, and their `start` script runs `node --run migrate`, so the stacks name no ORM. Drizzle's `migrate` follows core's: Drizzle's migrator without its `CREATE SCHEMA`, with its journal table in the app's schema.
- **Prisma.** Prisma 7.10.1, with the `prisma-client` generator and `@prisma/adapter-pg`. Chosen in the build, awaiting R's review:
  - The app's schema is its slug. `prisma.config.ts` takes it from the app's folder name and adds it to `DATABASE_URL` as `?schema=`, so `prisma migrate deploy` keeps `_prisma_migrations` there. `src/database.ts` takes it from `ROBKIT_APP` and hands it to the adapter.
  - The generated client is committed under `src/generated/prisma`, as Start's `routeTree.gen.ts` is. A generate step would have to run before typecheck, dev and build, and the Docker image installs before its source is copied in. The install's ESLint and Prettier skip it.
  - A migration must not create a schema, and Prisma's `migrate diff --from-empty` always starts with `CREATE SCHEMA IF NOT EXISTS`. The first migration is that diff without the statement. `pnpm db:migration <name>` diffs the app's schema in the local database, with `pnpm dev` running, against `prisma/schema.prisma`, which writes no `CREATE SCHEMA`, then regenerates the client. It needs no shadow database.
  - `@prisma/engines` has an install script that fetches the schema engine `migrate deploy` runs, and pnpm 11 refuses dependencies with unlisted scripts. An option now names these as `builds`, which the generator writes into `allowBuilds`. The engine is fetched while the image installs, so a container needs no network to migrate.
- **Tests.** The whole-stack test adds a third install, on Prisma: a Start example and a React + Hono app from `robkit add`. It runs every journey but the role one, adding about 30s, and the install passes its own CI workflow's steps, about 20s more. `pnpm test:production` deploys a default and a Prisma install, which takes about seven minutes.
- The packing check in `repo-checks` got a 60s timeout: it passes in a second alone, and timed out at 5s under the full gate.
