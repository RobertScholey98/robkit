# 24: Apps leave the catalog

**What to build:** Core adds an app to its catalog the first time it sees it in `ROBKIT_APPS` and never takes one out. A deleted app stays in the launcher and in admin for good, and a new app that reuses its slug inherits the old access rule, so one meant for the owner only can come up open to anyone ([review](../research/review-2026-11-09.md), "Apps never leave the catalog").

- **Core's catalog follows `ROBKIT_APPS`.** At start, in one transaction, core deletes each catalog row the list no longer names, and adds the ones it names that are new. The roles' links to a deleted app go with its row, since `app_roles` already cascades. So a removed app is unknown everywhere core looks one up: the launcher, admin's list, `GET /apps/:slug/access`, a change to its access, and `/refresh`, which mints nothing for it (ticket 02). No "removed" mark, and no migration.
- **A slug that comes back is a new app.** Its rule is the one its manifest declares, or owner only. The rule the owner set in admin went with the row. This holds for an app that is gone for one start only, as after switching branch, and the install's `AGENTS.md` says so.
- **The core that starts last decides.** Two cores can start at once with different lists, as when a deploy replaces core's container. Each start applies its whole list or none of it, one after the other, so the catalog is never a mix of two lists. Use a lock on the table or its rows inside the transaction, not an advisory lock. A core that is already serving never applies its list again.
- **An empty list is a list.** `ROBKIT_APPS=[]` is what an install with only the platform apps sends, and it removes every app. A missing, blank or malformed `ROBKIT_APPS` is different: core refuses to start, where today it reads a missing one as empty. Core reads and checks the list before it changes the catalog. `pnpm dev` and `robkit deploy` always set it. Update the core tests that start without it.
- **Nothing is deleted from Postgres's app schemas or from the host.** The app's schema, role and data stay, and so does its Coolify application, which ticket 22's `robkit deploy` names as matching no app.
- **"Removing an app" in the install's `AGENTS.md`.** Delete its folder, then restart `pnpm dev` or deploy. It says what removal doesn't do: a token the app already holds for a viewer lasts until it expires, its container runs until its application is deleted, and its database role and schema stay. It says how to drop the schema and role by hand, and links to `docs/deploy.md` for deleting the application, which ticket 22 writes. In production the removal takes effect when core deploys, which ticket 22 makes happen when an app's folder is deleted.

**Blocked by:** 12

**Status:** done

- [x] An app dropped from `ROBKIT_APPS` is gone from the launcher, admin and `/apps/:slug/access` after core restarts
- [x] `/refresh` with a `next` on a removed app is refused as for an unknown app, and a change to its access answers unknown app
- [x] A reused slug comes up with its manifest's rule, or owner only when it declares none, and with none of its old roles
- [x] Two cores that start together with different lists leave the catalog holding exactly one of the two lists
- [x] A core that is already serving doesn't change the catalog when another starts
- [x] `ROBKIT_APPS=[]` starts core and removes every app
- [x] A missing, blank or malformed `ROBKIT_APPS` stops core with a message, and changes nothing in the catalog
- [x] The install's `AGENTS.md` has "Removing an app", with what removal doesn't do and that a slug that comes back is a new app
- [x] The PR's CI `gate` job passes on GitHub

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

### From the build, 2026-11-11

Chosen in the build:

- `registerApps` keeps its name and signature, so core's API report doesn't change. It now makes the catalog hold exactly the list it gets. Renaming it would have touched every test that calls it and changed nothing an owner sees.
- The lock is `lock table core.apps in exclusive mode`, the transaction's first statement, as `ensureSigningKey` locks `core.signing_keys`. Exclusive mode lets reads through while a core starts, so a serving core's launcher and `/apps/:slug/access` don't wait. It holds off every change, a second core's lock and an owner's change to an app's access included.
- A `ROBKIT_APPS` of only spaces reads as not set, with the same message.
- A removed app's rule loses its links to roles. The roles stay, since codes and other apps may hold them.
- In the install's `AGENTS.md`, "Removing an app" is a part of its own under "Adding and removing apps", and the old one-line bullet went into it. It drops the schema and role with `drop owned by <slug>; drop role <slug>;`. A plain `drop role` is refused, since the role owns its schema and holds `connect` on the database. Both tried on Postgres 18.
- Tests: `apps.db.test.ts` covers removal through `registerApps` (launcher, admin's list, access, `/refresh`, a change to access, a reused slug, `[]`). `serve-core.db.test.ts` covers it through `serveCore`: a restart with a shorter list, `[]`, a missing, blank or malformed list, two cores starting together, and a core already serving. The two-cores test holds `core.apps` from another session until both cores wait on it, then lets go. Without the lock it failed three runs of three, with the catalog holding both lists.

The lead's question from milestone 3, about a new core that doesn't come up: this ticket doesn't change it, as the ticket round said. A new core from `robkit add` applies its longer list before it serves, so if it then fails, the old core lists the added app until the next `pnpm dev`. A longer list removes nothing, so no app goes missing.

Found in the build, not built: a removed app still running in production answers every request with a 503 whose text is "Can't reach core to check who may open this app.", within a minute of core's deploy. Core did answer, with 404, so the text misleads. The guard's log line is right: "robkit guard for notes answered 503: couldn't load the app's access rule from core." with the cause "Core doesn't know an app called notes." A later ticket could give the unknown-app case its own text.

### For the docs site

What an owner sees after this ticket:

- Deleting `apps/<slug>`, then restarting `pnpm dev` or deploying, takes the app out of the launcher and admin. The rule set for it in admin goes too. In production, core applies this when it deploys.
- `pnpm dev` still needs a restart after an app's folder is deleted.
- A slug that comes back is a new app, with the rule its manifest declares, or owner only. That holds after switching to a branch that still has the folder.
- Nothing is deleted from Postgres: the app's schema and role stay. The install's `AGENTS.md` gives `docker compose exec postgres psql -U postgres -d robkit -c 'drop owned by notes; drop role notes;'`, and the same two statements with `psql` and `ROBKIT_ADMIN_DATABASE_URL` in production.
- The app's Coolify application keeps running until the owner deletes it ("Removing an app's application" in the install's `docs/deploy.md`).

What a guest or viewer sees: the app leaves their launcher. In production, an app still running answers every request with a 503, "Can't reach core to check who may open this app.", from at most a minute after core's deploy. A token the app already holds lasts until it expires, at most 15 minutes, and core mints it no new one.

What an app's author sees: nothing new. The guard and the session protocol don't change.

Settings reference: `ROBKIT_APPS` is now required. `[]` is a real list, which an install with only the platform apps sends, and removes every app. Missing or blank, core refuses to start and prints:

```text
ROBKIT_APPS is not set. pnpm dev and robkit deploy set it from each app's manifest. Set it to [] only for an install with no apps of its own, since [] takes every app out of core's catalog, with the rule the owner set for each.
```

A malformed one prints, as before, `ROBKIT_APPS isn't valid JSON (<the parser's reason>). Fix its syntax.`, or `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.`, or the problem with one app, such as `ROBKIT_APPS[0].icon must be one emoji, such as "📝".` Each stops core before it touches the catalog.

### Merged

Added by the lead. PR 112 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `2b8a22e`. The lead read the diff and changed nothing.

The lead checked that every way robkit starts core sets `ROBKIT_APPS`. `pnpm dev` sets it through `catalogOf`. `robkit deploy` sets it through `deploymentOf`, for core, whatever the install holds. A shorter list changes core's variables, so `robkit deploy` redeploys core when an app's folder is gone.

For R to know:

- An app missing from the list for one start of core loses the rule the owner set in admin. Deploying from a branch without the app's folder does that.
- A removed app still running in production answers 503 with "Can't reach core to check who may open this app.", though core answered. The map lists it as a known gap with no ticket.

### From the code round, 2026-11-11

Milestone 4's code had its one council round at `6ec738ed`. Opus 5.5 gave it 7.5 out of 10 and Sol 6.1 gave 7, and neither would merge it as it stood. I checked each finding against the code before I acted on it. One was about this ticket, and I took it.

- **The message for a missing `ROBKIT_APPS` says what `[]` does** (Opus, should-change, `d9371220`). It said to set `[]` for an install with no apps of its own. On an install that has apps, `[]` takes each out of the catalog, with the rule the owner set for it. The message now ends "Set it to [] only for an install with no apps of its own, since [] takes every app out of core's catalog, with the rule the owner set for each." The text above and the changeset match.
