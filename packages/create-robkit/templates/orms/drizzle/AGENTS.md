## The database

The app talks to Postgres through the `postgres` client over `DATABASE_URL`. Its role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

`src/migrate.ts` is the app's migration. `pnpm dev`, and the provision step before a deploy, run it after the app's schema and role exist and before the app starts. It runs every time, so each statement must be safe to run again:

- To add a table, add a `create table if not exists` statement.
- To add a column, add `alter table ... add column if not exists`.
- To change data once, guard the statement so a second run changes nothing.
