## The database

The app talks to Postgres with Kysely over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares each table's types for queries. Never call `withSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database, connected on first use. `src/visits.ts` shows a query.
- `src/migrations/` holds the migrations, one file each, exporting `up` and `down`. To change a table, add the next numbered file, list it in `src/migrations/index.ts`, update `src/schema.ts` to match, and commit all three. Never edit a migration that has run, and never create a schema in one: the app's role may not.

`src/migrate.ts` applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It keeps Kysely's migration tables in the app's schema.
