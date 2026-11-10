# 0015: Sibling subdomains are a boundary

**Status:** chosen in the builds of [Host-only cookies a sibling can't plant](../../.scratch/just-use-it/issues/03-host-prefixed-cookies.md), [The guard refuses a cross-origin write](../../.scratch/just-use-it/issues/05-guard-refuses-cross-origin-writes.md) and [No app can be framed from another origin](../../.scratch/just-use-it/issues/06-no-framing-from-another-origin.md), 2026-11-09 and 2026-11-10, awaiting R's review.

## Context

Every app of an install is a subdomain of one domain, and an owner may add an app they didn't write. A browser counts those subdomains as one site. The [review of 2026-11-09](../../.scratch/just-use-it/research/review-2026-11-09.md) found three ways one app could act on another as the viewer:

- It could set a cookie on the parent domain that the browser sends beside the real session cookie, and the planted one could win.
- `SameSite=Lax` sends an app's cookie with a form posted from a sibling, so a sibling's page could post to another app's handler.
- Nothing told a browser who may frame a page, so a sibling could frame admin and trick the viewer into clicks.

## Decision

Treat each app's origin as the boundary, and enforce it in the guard and core, in both ports.

- **`__Host-` cookies.** Where the install's origin is https, core's and each app's session cookie is `__Host-robkit_session`, and the guard's state cookie `__Host-robkit_state`. A browser refuses a `__Host-` cookie that names a `Domain`, so a sibling can't plant one. Over http the names stay plain, because the prefix needs `Secure`, and an http install is a local one. `sessionCookies(origin)` in `@robkit/session` gives the names and attributes, and a name matches exactly.
- **The cross-origin rule.** The guard refuses a write from another origin with 403 before it reads the session. GET, HEAD and OPTIONS pass. For any other method, `Sec-Fetch-Site` decides when present: `same-origin` and `none` pass. Without it, `Origin` decides: absent or the app's own origin passes. A WebSocket handshake is judged by `Origin` alone, because browsers disagree on the fetch metadata they send with one.
- **The framing headers.** The guard sends `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff` on every answer it lets through, and leaves the framing header off its own redirects. An app that allows a framer says so with `Content-Security-Policy: frame-ancestors` in its own answers, which a browser obeys over `X-Frame-Options`. Core sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Core and the guard send `Strict-Transport-Security` for a year on an https install, without `includeSubDomains`. `securityHeaders` in `@robkit/input/headers` gives the values.

Ticket 06 says why `X-Frame-Options` and not a default policy: an app's own policy and the guard's don't both survive every stack, and the two headers never meet.

## Consequences

- An https install doesn't read the plain cookie names, so a browser signed in before the change signed in once more.
- `SECURITY.md` says what each rule rests on and what it leaves: the cookie rule holds in a browser that refuses a nameless cookie whose value starts `__Host-`, and the write rule in one that sends fetch metadata or `Origin`. A GET with side effects, a WebSocket the guard never sees, and a window a sibling opens are the app's or the viewer's to guard.
- Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE, and how to allow a framer.
- The cases live in `tooling/test-session/request-cases.json`, and every adapter and the Go port run them.
- No option lets an app accept writes from another origin yet. Ticket 05's comments name where one would go.
