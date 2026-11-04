## The database

The app talks to Postgres with Prisma over `DATABASE_URL`, as its own role. Its tables live in the app's own schema, named after its slug: `prisma.config.ts` points Prisma's commands at it, and `src/database.ts` points the client at it. The role can't reach core's schema or another app's.

- `prisma/schema.prisma` declares the tables. Name each table with `@@map`, in lowercase. Don't add a `schemas` list or `@@schema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the client, connected on first use. `src/visits.ts` shows a query.
- `src/generated/prisma` is the client Prisma generates from the schema. It is committed, so the app builds without a generate step. Never edit it.
- `prisma/migrations` holds the migrations. After changing `prisma/schema.prisma`, run `pnpm db:migration <name>`, with `pnpm dev` running, and commit what it writes. It diffs the app's schema in the local database against `prisma/schema.prisma` into the next migration, then regenerates the client. Never edit a migration that has run.

`pnpm migrate` runs `prisma migrate deploy`, which applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. A migration must not create a schema: the app's role may not, and Prisma's `migrate diff --from-empty` writes a `CREATE SCHEMA` first, so don't use it.
