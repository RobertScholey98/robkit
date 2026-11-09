# 20: Apps leave the catalog

**What to build:** Core adds an app to its catalog the first time it sees it in `ROBKIT_APPS` and never takes one out. A deleted app stays in the launcher and in admin for good, and a new app that reuses its slug inherits the old access rule, so one meant for the owner only can come up open to anyone ([review](../research/review-2026-11-09.md), "Apps never leave the catalog").

- **Core's catalog follows `ROBKIT_APPS`.** At start, an app in the catalog that the list no longer names is marked removed. A removed app is out of the launcher and out of admin's list, `GET /apps/:slug/access` answers as for an unknown slug, and `/refresh` mints nothing for it (ticket 04).
- **A slug that comes back starts again.** When a removed slug reappears, its rule is the one its manifest declares, or owner only, as for a new app. The old rule is gone.
- **Nothing is deleted from Postgres.** The app's schema, role and data stay. Say in the install's `AGENTS.md` how to drop them by hand.
- **An empty list is refused.** `ROBKIT_APPS` unset or unreadable must not mark every app removed. Core refuses to start, as it does for any setting it can't read.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] An app dropped from `ROBKIT_APPS` is gone from the launcher, admin and `/apps/:slug/access` after core restarts
- [ ] A reused slug comes up with its manifest's rule, not the old one
- [ ] An unset or malformed `ROBKIT_APPS` stops core with a message, and marks nothing removed
- [ ] The migration and `schema.ts` agree, and a database from before the change migrates
- [ ] The PR's CI `gate` job passes on GitHub
