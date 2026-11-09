# 06: The platform's pages can't be framed

**What to build:** Nothing in an install sets `frame-ancestors`, so an imported app can put `admin.<domain>` in a frame. The frame is same-site, so the owner's cookies go with it, and two tricked clicks open an app to everyone ([review](../research/review-2026-11-09.md), "A sibling app can frame admin").

- **The headers.** Core, the hub and admin send `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` on every answer. The guard's own answers, such as the callback's pages, send them too, in both ports.
- **HSTS on a hosted install.** Core, the hub and admin send `Strict-Transport-Security` when the install isn't local. Pick the max-age and say why in the comments.
- **One place each.** The hub's and admin's servers are template files an owner owns, so keep what they add short and obvious.
- **An owner's own apps aren't covered.** The guard can't add a header to an app's answers in every stack. Say so in `SECURITY.md`'s known gaps, and in each stack's `AGENTS.md` say how the app sets `frame-ancestors` itself.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Every answer from core, the hub and admin carries both headers, error answers included
- [ ] The guard's own pages carry both headers, in both ports
- [ ] A hosted install's core, hub and admin send HSTS, and a local install's don't
- [ ] The whole-stack test loads admin in a frame from a sibling app's page and the browser refuses it
- [ ] `SECURITY.md` lists the gap for an owner's own apps, and each stack's `AGENTS.md` says how to close it
- [ ] The PR's CI `gate` job passes on GitHub
