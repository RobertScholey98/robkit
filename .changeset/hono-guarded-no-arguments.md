---
"@robkit/hono": minor
---

`guarded()` needs no options. It reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself, and ends the process with the reader's message when one is missing or won't do. `app` and `core` may be plain strings.
