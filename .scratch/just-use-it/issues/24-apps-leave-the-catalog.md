# 24: Apps leave the catalog

**What to build:** Core adds an app to its catalog the first time it sees it in `ROBKIT_APPS` and never takes one out. A deleted app stays in the launcher and in admin for good, and a new app that reuses its slug inherits the old access rule, so one meant for the owner only can come up open to anyone ([review](../research/review-2026-11-09.md), "Apps never leave the catalog").

- **Core's catalog follows `ROBKIT_APPS`.** At start, in one transaction, an app in the catalog that the list no longer names is marked removed. A removed app is out of the launcher and out of admin's list, `GET /apps/:slug/access` answers as for an unknown slug, and `/refresh` mints nothing for it (ticket 02).
- **A slug that comes back starts again.** When a removed slug reappears, its rule is the one its manifest declares, or owner only, as for a new app. The old rule is gone.
- **An empty list is a list.** `ROBKIT_APPS=[]` is what an install with only the platform apps sends, and it removes every app. A missing, blank or malformed `ROBKIT_APPS` is different: core refuses to start, where today it reads a missing one as empty. `pnpm dev` and `robkit deploy` always set it. Update the core tests that start without it.
- **Nothing is deleted from Postgres or the host.** The app's schema, role and data stay, and so does its Coolify application, which ticket 22's `robkit deploy` names as matching no app. The install's `AGENTS.md` gains "Removing an app": delete its folder, restart `pnpm dev` or deploy, then how to drop the schema and role and delete the application by hand.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] An app dropped from `ROBKIT_APPS` is gone from the launcher, admin and `/apps/:slug/access` after core restarts
- [ ] A reused slug comes up with its manifest's rule, not the old one
- [ ] `ROBKIT_APPS=[]` starts core and removes every app
- [ ] A missing, blank or malformed `ROBKIT_APPS` stops core with a message, and marks nothing removed
- [ ] The migration and `schema.ts` agree, and a database from before the change migrates
- [ ] The PR's CI `gate` job passes on GitHub
