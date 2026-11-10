---
"@robkit/drizzle": minor
---

New package. `migrate()` applies an app's Drizzle migrations in its own schema, under a lock on its own journal table, so two runs started together apply each migration once.
