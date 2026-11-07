---
"@robkit/next": patch
---

`@robkit/next` is the Next.js 16 adapter. `guarded(options)` is the proxy for `src/proxy.ts`: it runs the request guard on Node and passes the viewer on in a request header that nobody can send their own of, or sends the guard's answer. `viewer()` reads it in server components, route handlers and server actions, and throws when the proxy didn't guard the request. A server action whose session lapsed gets the guard's 401 with Next's `x-action-redirect`, so the browser goes to sign in and comes back.
