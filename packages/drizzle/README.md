# @robkit/drizzle

Applies a robkit app's Drizzle migrations in the app's own Postgres schema. Core migrates through it too, so robkit has one migrator.

## Example

```ts
import { migrate } from "@robkit/drizzle";

// DATABASE_URL connects as the app's own role.
await migrate({
  databaseUrl: process.env.DATABASE_URL ?? "",
  folder: "drizzle",
});
```

## Exports

| Export             | What it is                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate(options)` | Applies the migrations in `folder` that haven't run, keeping Drizzle's journal table in the role's schema, or in `schema` when the options name one |
| `MigrateOptions`   | `databaseUrl`, `folder` and the optional `schema`                                                                                                   |

## What it must never do

- Create a schema. The provision step makes each app's schema, and an app's role may not create one.
- Take an advisory lock. Any role in the shared database can take any advisory key, so one app could stall another's migration. It locks its own journal table instead, which only the schema's role can.

## For contributors

Two runs can start together, as two containers of one app do. Each creates the journal table if it is missing, then locks it inside the transaction that migrates. The second waits for the first to commit and finds nothing left to apply.

When two runs both find the journal missing, Postgres refuses the later create with one of several errors (`42P07`, `42710` or `23505`), depending on how far the first had got. The migrator sorts none of them: when its create is refused, it looks in `pg_tables` and goes on if the table is there. A list of codes missed one in CI.
