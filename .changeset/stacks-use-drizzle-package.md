---
"create-robkit": minor
---

The four Node stacks take their database from `@robkit/drizzle`. `src/database.ts` is `appDatabase(schema)`, `src/migrate.ts` is gone, and the `migrate` script is `robkit-migrate`, which locks its journal table so two containers that start together apply each migration once. An app that migrated with the old `src/migrate.ts` carries on from its journal.
