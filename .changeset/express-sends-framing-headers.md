---
"@robkit/express": patch
---

`guarded` sets `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and, on an https install, `Strict-Transport-Security` on the response before the app's handlers run. A handler that sets one of its own replaces it.
