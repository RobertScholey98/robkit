# 06: No app can be framed from another origin

**What to build:** Nothing in an install sets `frame-ancestors`, so an imported app can put `admin.<domain>`, or any other app, in a frame. The frame is same-site, so the viewer's cookies go with it, and two tricked clicks in a framed admin open an app to everyone ([review](../research/review-2026-11-09.md), "A sibling app can frame admin"). Every adapter owns the path an answer takes, so the guard can send the header for every guarded app, admin included, from a package that updates.

- **The guard sends its own policy header.** Every answer that passes through the guard carries a `Content-Security-Policy` header that says only `frame-ancestors 'self'`, and `X-Content-Type-Options: nosniff`: the answers the guard lets through, and the guard's own redirects and pages. The guard never reads or edits a policy the app sets. A browser enforces every policy header it gets, so the app's stays whole, and an app that sets `default-src` doesn't switch the guard's off. An app's own `frame-ancestors` can only narrow it.
- **One option changes it.** An option on `guarded()` gives the origins allowed to frame the app, or turns the header off. That is the only way to widen it. An app that wants to sit in the hub's frame names the hub.
- **Each stack's way.** Hono and Start add the header to the answer on its way out, Express sets it before the handler runs, Go wraps the writer, and Next's guard answers before the page exists, so it sets the header on the answer it passes on. For each, confirm the header arrives when the app sets a policy of its own. If a stack lets the app's header replace the guard's, say so in that stack's `AGENTS.md` and in the comments.
- **Core.** Core sends both headers on every answer, errors included, with `frame-ancestors 'none'`.
- **HSTS where the install is https.** Core and the guard send `Strict-Transport-Security` when the install's origin is https. Pick the max-age and say why in the comments. No `includeSubDomains`: the domain may hold hosts robkit doesn't run.
- **What isn't covered.** Files a stack serves without the guard, such as an app's built scripts and styles, don't carry the header, and aren't pages. The hub isn't guarded: tickets 10 and 11 give it the same headers, from `robkit()` in dev and `servePage()` in production. Say both in the comments.
- **Docs.** `SECURITY.md` says no guarded app can be framed from another origin by default, and what isn't covered. Each stack's `AGENTS.md` says how to allow a framer.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Every answer that passes through the guard, on every stack and from admin, carries both headers: pages, API answers, the guard's redirects and its own pages
- [ ] An app that sets its own `Content-Security-Policy` with no `frame-ancestors` still can't be framed from another origin, on every stack
- [ ] The option allows a named origin to frame the app, and can turn the header off, in every adapter and in Go
- [ ] Core sends both headers on every answer
- [ ] An https install sends HSTS from core and from guarded apps, and an http one doesn't
- [ ] The whole-stack test loads admin and an app in a frame from a sibling app's page, and the browser refuses both
- [ ] The PR's CI `gate` job passes on GitHub
