---
"@robkit/input": minor
"@robkit/session": patch
---

`securityHeaders`, `withHeaders`, `isRedirect` and `Framers` move to a new `@robkit/input/headers` entry, so a package with nothing from the guard can send robkit's headers. `@robkit/session` still exports them.
