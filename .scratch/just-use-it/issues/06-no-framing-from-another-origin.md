# 06: No page can be framed from another origin

**What to build:** Nothing in an install sets `frame-ancestors`, so an imported app can put `admin.<domain>`, or any other app, in a frame. The frame is same-site, so the viewer's cookies go with it, and two tricked clicks in a framed admin open an app to everyone ([review](../research/review-2026-11-09.md), "A sibling app can frame admin"). Every adapter owns the path an answer takes, so the guard can send the headers for every guarded app, admin included, from a package that updates.

- **The guard's headers.** Every answer from a guarded app carries `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`: the answers the guard lets through and the guard's own pages. Where the app's answer already has a `Content-Security-Policy`, the app's stands whole and the guard adds none. Each adapter does it the way its stack allows, and Go's `Guarded` does the same.
- **An owner can change it.** One option on `guarded()` gives the origins allowed to frame the app, or turns the header off. An app that wants to sit in the hub's frame names the hub.
- **The hub and core.** The hub isn't guarded, so it sends both headers itself, from Vite's dev server and from its production server. Core sends them on every answer, errors included.
- **HSTS where the install is https.** Core, the hub and the guard send `Strict-Transport-Security` when the install's origin is https. Pick the max-age and say why in the comments. No `includeSubDomains`: the domain may hold hosts robkit doesn't run.
- **Docs.** `SECURITY.md` says no page in an install can be framed from another origin by default. Each stack's `AGENTS.md` says how to allow a framer.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Every answer from an app on every stack, and from admin, carries both headers: pages, API answers, the guard's redirects and its own pages
- [ ] An app that sets its own `Content-Security-Policy` keeps it unchanged
- [ ] The option allows a named origin to frame the app, and can turn the header off, in every adapter and in Go
- [ ] The hub sends both headers under `pnpm dev` and in production, and core on every answer
- [ ] An https install sends HSTS from core, the hub and guarded apps, and an http one doesn't
- [ ] The whole-stack test loads admin and an app in a frame from a sibling app's page, and the browser refuses both
- [ ] The PR's CI `gate` job passes on GitHub
