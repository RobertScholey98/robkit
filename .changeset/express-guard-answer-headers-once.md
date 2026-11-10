---
"@robkit/express": patch
---

The guard's own answers carry each header once. Where middleware before `guarded()`, such as helmet, had already set `X-Frame-Options`, `nosniff` or HSTS, the answer used to carry both copies, and a browser treats two different `X-Frame-Options` values as a refusal. The guard's value now replaces the earlier one. Each `Set-Cookie` still goes out on its own.
