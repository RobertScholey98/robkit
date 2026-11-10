---
"create-robkit": patch
---

Every stack's server file gets its guard in one call with no settings: `guarded()` on Hono, Express and Next, `guarded(entry)` on Start, and `session.Guarded(session.Options{})` on Go. None imports `@robkit/input` or reads `ROBKIT_APP` or `ROBKIT_CORE_URL` itself.
