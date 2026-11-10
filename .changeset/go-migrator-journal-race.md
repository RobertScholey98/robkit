---
"create-robkit": patch
---

The Go stack's migrator goes on when another run creates its `schema_migrations` table at the same moment, rather than failing the second container's start.
