---
"@robkit/core": patch
---

Core sends `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` on every answer that isn't a redirect, errors and CORS preflights included, and `nosniff` alone on a redirect. An https core sends `Strict-Transport-Security` too.
