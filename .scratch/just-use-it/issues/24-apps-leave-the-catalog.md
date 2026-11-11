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

## Comments

### From milestone 3, added by the lead

Since ticket 18, `robkit add` works while `pnpm dev` runs. The runner starts a second core beside the running one, with the longer `ROBKIT_APPS`, moves core's route to it once it answers, and stops the old one. Two things follow for this ticket:

- **Two cores run at once for a moment, with different lists.** The new one has the longer list, so marking removed at start takes nothing away there. But the rule must hold when a core with a shorter list starts while another still runs, as a deploy that replaces core's container does.
- **A new core that doesn't come up is stopped, and the runner keeps the old one** (milestone 3's code round). By then the new core may have added the app to the catalog. The old core reads the catalog from the database, so the launcher lists an app that isn't running until the next `pnpm dev`. That is so today as well. Say in the comments whether this ticket changes it.

The runner sets `ROBKIT_APPS` for every core it starts, at start and in an add, so the new refusal for a missing one doesn't reach `pnpm dev`.

The docs site, built beside this milestone on the `docs-site` branch, has a page on removing an app (docs-site ticket 16) and a settings reference (21). The page says what happens today: a removed app stays in the launcher and in admin. Say in this ticket's comments what an owner sees after it, and what core says when `ROBKIT_APPS` is missing. The docs site's last build ticket (26) works from that.
