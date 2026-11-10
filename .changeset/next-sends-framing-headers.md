---
"@robkit/next": patch
---

The proxy sets `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and, on an https install, `Strict-Transport-Security` on every request it passes on. Next sends them with the page's or route handler's answer. A page lets another origin frame it with `frame-ancestors` in `headers()` in `next.config.ts`.
