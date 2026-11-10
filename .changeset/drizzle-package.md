---
"@robkit/drizzle": minor
---

New package. `appDatabase(schema)` gives an app its Drizzle database, connected on first call from `DATABASE_URL`, with one pool across a dev server's reloads. `robkit-migrate` applies an app's migrations in its own schema, under a lock on its own journal table, so two runs started together apply each migration once. `migrate()` is the same migrator for code, which core uses.
