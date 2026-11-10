---
"@robkit/start": patch
---

`guarded` adds `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and, on an https install, `Strict-Transport-Security` to every answer it lets through, where Start set none of the same name. An answer whose headers can't change, such as `Response.redirect()`'s, is copied first.
