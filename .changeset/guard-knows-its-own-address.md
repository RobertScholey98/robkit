---
"@robkit/session": patch
"@robkit/express": patch
"@robkit/next": patch
---

The guard knows its own address. Every URL it sends the browser to is the app's origin, worked out from `core` and `app`, plus the request's path and query. It no longer reads `Host` or `X-Forwarded-Proto`, so a proxy hop that rewrites either changes nothing, and an https install whose last hop is plain http keeps `next` on https.

- `appOrigin(options)` in `@robkit/session` gives the app's public origin.
- The Express and Next adapters read no `Host`. A request line such as `//evil.com/x` stays a path on the app, and a request without a `Host`, or with an empty one, is guarded like any other instead of answered with 400.
