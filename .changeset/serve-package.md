---
"@robkit/serve": minor
"@robkit/core": patch
---

New package. `listenUntilStopped()` serves a request handler until SIGTERM or SIGINT, lets open requests finish, and resolves with 0. It moves here from core, which now listens and stops through it.
