---
"@robkit/session": patch
---

The guard sends `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff` on every answer it lets through and on its own pages, and `Strict-Transport-Security` on an https install. Its redirects carry no framing header. `requestGuard`'s `serve` decision carries the `headers` an adapter puts on the app's answer. New exports: `securityHeaders`, `withHeaders`, `isRedirect` and `Framers`.
