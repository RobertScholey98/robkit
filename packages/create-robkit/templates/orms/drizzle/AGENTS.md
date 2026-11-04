## The database

The app talks to Postgres with Drizzle over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares the tables. Use `pgTable`, never `pgSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database, connected on first use. `src/visits.ts` shows a query.
- `drizzle/` holds the migrations. After changing `src/schema.ts`, run `pnpm db:generate` to write the next one, and commit it. Never edit a migration that has run.

`src/migrate.ts` applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It follows Drizzle's migrator but skips its `CREATE SCHEMA`, which the app's role may not run, and keeps its journal table in the app's schema.
