# @robkit/drizzle

Gives a robkit app its Drizzle database, as the app's own Postgres role, and applies its migrations in the app's own schema. Core migrates through it too, so robkit has one migrator.

## Example

An app's `src/database.ts`:

```ts
import { appDatabase } from "@robkit/drizzle";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});

export const database = appDatabase({ note });

// In a handler:
const notes = await database().select().from(note);
console.log(notes);
```

An app keeps its tables in `src/schema.ts` and passes them all, as `appDatabase(schema)` after `import * as schema from "./schema.ts"`.

`appDatabase` reads `DATABASE_URL` and connects on the first call of the function it returns, never as the module loads, so `next build` can load the app with no database set. When `DATABASE_URL` is missing or isn't a postgres:// URL, that first call prints what to fix and ends the process with 1, as every setting an app's server reads does.

The pool opens once per process, with at most 2 connections unless the second argument, postgres.js's options, says otherwise. A dev server that reloads the app's modules gets the same pool back, and a Drizzle database built from the schema as it now is, so a table added to `schema.ts` can be queried on the next request.

An app's `migrate` script is `robkit-migrate`. It applies the migrations in the app's `drizzle` folder that haven't run, as the app's role, and prints `migrated`. Give it a folder, as `robkit-migrate db/migrations`, when `drizzle.config.ts` sets `out` to another. It keeps its journal table, `__drizzle_migrations`, in the app's schema, where each Node stack's old `src/migrate.ts` kept it, so an app that migrated with that carries on. A missing `DATABASE_URL` prints the reader's message and exits 1.

## Exports

| Export                          | What it is                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robkit-migrate [folder]` (bin) | An app's `migrate` script, above                                                                                                                    |
| `appDatabase(schema, options?)` | A function that gives the app's Drizzle database, connected on first call from `DATABASE_URL`                                                       |
| `AppDatabase`, `PoolOptions`    | What that function returns, and postgres.js's options                                                                                               |
| `migrate(options)`              | Applies the migrations in `folder` that haven't run, keeping Drizzle's journal table in the role's schema, or in `schema` when the options name one |
| `MigrateOptions`                | `databaseUrl`, `folder` and the optional `schema`                                                                                                   |

`drizzle-orm` and `postgres` are peer dependencies, so the app's own copies are the ones it installs.

## What it must never do

- Create a schema. The provision step makes each app's schema, and an app's role may not create one.
- Take an advisory lock. Any role in the shared database can take any advisory key, so one app could stall another's migration. It locks its own journal table instead, which only the schema's role can.

## For contributors

Two runs can start together, as two containers of one app do. Each creates the journal table if it is missing, then locks it inside the transaction that migrates. The second waits for the first to commit and finds nothing left to apply.

When two runs both find the journal missing, Postgres refuses the later create with one of several errors (`42P07`, `42710` or `23505`), depending on how far the first had got. The migrator sorts none of them: when its create is refused, it looks in `pg_tables` and goes on if the table is there. A list of codes missed one in CI.

The pools live on `globalThis`, keyed by `DATABASE_URL`, because a dev server may load this package again too, not just the app's modules.
