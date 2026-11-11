# 24: Apps leave the catalog

**What to build:** Core adds an app to its catalog the first time it sees it in `ROBKIT_APPS` and never takes one out. A deleted app stays in the launcher and in admin for good, and a new app that reuses its slug inherits the old access rule, so one meant for the owner only can come up open to anyone ([review](../research/review-2026-11-09.md), "Apps never leave the catalog").

- **Core's catalog follows `ROBKIT_APPS`.** At start, in one transaction, core deletes each catalog row the list no longer names, and adds the ones it names that are new. The roles' links to a deleted app go with its row, since `app_roles` already cascades. So a removed app is unknown everywhere core looks one up: the launcher, admin's list, `GET /apps/:slug/access`, a change to its access, and `/refresh`, which mints nothing for it (ticket 02). No "removed" mark, and no migration.
- **A slug that comes back is a new app.** Its rule is the one its manifest declares, or owner only. The rule the owner set in admin went with the row. This holds for an app that is gone for one start only, as after switching branch, and the install's `AGENTS.md` says so.
- **The core that starts last decides.** Two cores can start at once with different lists, as when a deploy replaces core's container. Each start applies its whole list or none of it, one after the other, so the catalog is never a mix of two lists. Use a lock on the table or its rows inside the transaction, not an advisory lock. A core that is already serving never applies its list again.
- **An empty list is a list.** `ROBKIT_APPS=[]` is what an install with only the platform apps sends, and it removes every app. A missing, blank or malformed `ROBKIT_APPS` is different: core refuses to start, where today it reads a missing one as empty. Core reads and checks the list before it changes the catalog. `pnpm dev` and `robkit deploy` always set it. Update the core tests that start without it.
- **Nothing is deleted from Postgres's app schemas or from the host.** The app's schema, role and data stay, and so does its Coolify application, which ticket 22's `robkit deploy` names as matching no app.
- **"Removing an app" in the install's `AGENTS.md`.** Delete its folder, then restart `pnpm dev` or deploy. It says what removal doesn't do: a token the app already holds for a viewer lasts until it expires, its container runs until its application is deleted, and its database role and schema stay. It says how to drop the schema and role by hand, and links to `docs/deploy.md` for deleting the application, which ticket 22 writes. In production the removal takes effect when core deploys, which ticket 22 makes happen when an app's folder is deleted.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] An app dropped from `ROBKIT_APPS` is gone from the launcher, admin and `/apps/:slug/access` after core restarts
- [ ] `/refresh` with a `next` on a removed app is refused as for an unknown app, and a change to its access answers unknown app
- [ ] A reused slug comes up with its manifest's rule, or owner only when it declares none, and with none of its old roles
- [ ] Two cores that start together with different lists leave the catalog holding exactly one of the two lists
- [ ] A core that is already serving doesn't change the catalog when another starts
- [ ] `ROBKIT_APPS=[]` starts core and removes every app
- [ ] A missing, blank or malformed `ROBKIT_APPS` stops core with a message, and changes nothing in the catalog
- [ ] The install's `AGENTS.md` has "Removing an app", with what removal doesn't do and that a slug that comes back is a new app
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 3, added by the lead

Since ticket 18, `robkit add` works while `pnpm dev` runs. The runner starts a second core beside the running one, with the longer `ROBKIT_APPS`, moves core's route to it once it answers, and stops the old one. Two things follow for this ticket:

- **Two cores run at once for a moment, with different lists.** The new one has the longer list, so marking removed at start takes nothing away there. But the rule must hold when a core with a shorter list starts while another still runs, as a deploy that replaces core's container does.
- **A new core that doesn't come up is stopped, and the runner keeps the old one** (milestone 3's code round). By then the new core may have added the app to the catalog. The old core reads the catalog from the database, so the launcher lists an app that isn't running until the next `pnpm dev`. That is so today as well. Say in the comments whether this ticket changes it.

The runner sets `ROBKIT_APPS` for every core it starts, at start and in an add, so the new refusal for a missing one doesn't reach `pnpm dev`.

The docs site, built beside this milestone on the `docs-site` branch, has a page on removing an app (docs-site ticket 16) and a settings reference (21). The page says what happens today: a removed app stays in the launcher and in admin. Say in this ticket's comments what an owner sees after it, and what core says when `ROBKIT_APPS` is missing. The docs site's last build ticket (26) works from that.

### From the ticket round, 2026-11-11

Taken:

- Opus: delete the row. `app_roles` cascades on delete (`schema.ts`), and nothing else points at an app's row, so there is no mark to filter in `listApps`, `accessOf`, `setAccess` and the launcher, and no migration. Sol's must-change, that a removed app be unknown to every access operation, follows from it.
- Sol: two starts that overlap must not leave a mix of two lists. `registerApps` handles two inserts of one app today, not two whole lists.
- Both: criteria for `/refresh` and for a change to a removed app's access.
- Sol: the docs say what removal doesn't do.
- Opus: the Coolify half of "Removing an app" is ticket 22's, in `docs/deploy.md`. This ticket links to it.

Decided here, and for R to know: a slug that is missing for one start loses the rule the owner set in admin, and comes back with its manifest's rule. Opus asked whether it should come back owner only instead. The ticket keeps "a slug that comes back is a new app", which is what the PRD's review finding asked for, and the install's `AGENTS.md` says so.

The answer to the note above about a new core that doesn't come up: this ticket doesn't change it. A core applies its list before it serves, so a core that then fails has already changed the catalog, and the core still running reads the catalog from the database. An older core that starts again applies its older list.

Order: this merges before ticket 34, which edits the same section of the install's `AGENTS.md`, and after ticket 30, which edits `packages/core`'s coverage thresholds too.
