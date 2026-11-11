# 22: Deploys don't skip

**What to build:** Two paths leave an app undeployed with nothing to say so ([review](../research/review-2026-11-09.md), "Core is redeployed only" and "A cancelled or failed run on main skips deploys"). Both come from `robkit deploy` not knowing what the host is actually running.

- **robkit records what a finished deploy applied.** After an application's deploy finishes, and only then, `robkit deploy` saves one record on that application: the commit robkit ran from, and a hash of the variables it saved for the application. The two are one value, so a record can't describe a pairing that never ran. For core the variables include `ROBKIT_APPS` and `ROBKIT_DATABASES`, so the hash covers them. Nothing is written to the repo: the install's CI can't push, and shouldn't.
- **Where the record goes.** Somewhere on the application that `robkit deploy` can read back and that changes nothing the container runs with, if Coolify has such a place. The application's description is one candidate. Otherwise a variable named `ROBKIT_DEPLOYED`. Choose from Coolify's API docs and its source, and say why in the comments.
- **When an app deploys.** It is new. Or it has no record, or one robkit can't read. Or its code changed since its recorded commit. Or the variables robkit is about to save differ from the recorded hash. Or its recorded commit is gone from history, as after a force push. A record that is missing, malformed or unreadable never proves an app unchanged: when in doubt, the app deploys.
- **What that fixes.** A first deploy whose core step failed finishes on the re-run. An existing core whose replacement failed is retried, since its variables were saved and no record was. An app that gains a `migrate` script changes core's `ROBKIT_DATABASES`, so core deploys and the app gets its role. A push that fixes a failed check deploys what the failed push changed, and two pushes in quick succession lose nothing.
- **The record is written last, and never for a deploy that didn't finish.** A failed, cancelled or timed-out deploy writes no record. If saving the record fails, the command fails and says so, and the next run deploys the app again.
- **Nothing is pinned.** Coolify builds what the branch holds when it gets to the app, which can be newer than the commit robkit ran from. robkit records its own commit, so the run for the newer push sees the app as changed and deploys it again, with that push's settings. That run brings code and settings back together. Pinning a build to a commit means setting the commit on the application, which changes what Coolify's own Redeploy button builds, so this ticket doesn't.
- **robkit sets turbo's base itself.** `robkit deploy` works out what changed for each app since the commit recorded for it. It ignores `TURBO_SCM_BASE` from its environment, which an older install's workflow still sets. Apps usually share one recorded commit, so it asks turbo once for each distinct commit. `--all` and `--apps` work as today.
- **A failed core holds the apps back.** When core's settings can't be saved, or core's deploy fails, no app deploys in that run. The command fails and names the apps it held back.
- **It says what the host is missing.** Before it deploys anything, `robkit deploy` checks the environment's shared variables for each one the apps refer to: `ROBKIT_DB_SECRET`, `ROBKIT_ADMIN_DATABASE_URL` and each app's database URL. It reads names only and never prints a value. It names any that are missing, with the command that prints the value, and deploys nothing. If Coolify's API can't list them, or the token may not, say so in the comments and give the same message when a deploy fails for want of one.
- **Only this install's applications.** Adoption, the record and the report below look only at applications in the configured project and environment, built from this install's repository. Another environment's application is never updated, and never reported.
- **An app that is gone.** An application of this install's that matches no app is named in the output and left alone. Deleting an app's folder makes core's `ROBKIT_APPS` shorter, so core deploys. The runbook says how to delete the application. Ticket 24's "Removing an app" links there.
- **Core no longer gets `ROBKIT_DOMAIN`.** Core has read only `ROBKIT_CORE_URL` since ticket 02.
- **The install's CI stops cancelling `main`.** The template's workflow keeps `cancel-in-progress` for pull requests only, and no longer sets `TURBO_SCM_BASE`. `robkit upgrade` never writes `.github`, so the changeset says what to change by hand in an existing install's `ci.yml`. It also says the first deploy after the upgrade deploys every app, since none has a record.
- **The runbook says what it needs.** The install's `docs/deploy.md` says a TLS terminator in front of Coolify is required, and names the one `robkit deploy` is written for: a Cloudflare tunnel, which carries plain http to Traefik. It says what breaks without one. It says Coolify's own certificates aren't supported yet, since `robkit deploy` writes `http://` domains. It also says a missing shared variable stops the whole deploy.
- **The dry run gives reasons.** With `COOLIFY_URL` and `COOLIFY_TOKEN`, `robkit deploy --dry-run` reads Coolify, writes nothing to it, and prints each app's action and reason: new, changed since which commit, its variables changed, or no record. Without them it prints each app's variables, as today, and says the reasons need the host.
- **What CI can't prove.** The tests run against `src/test/fake-coolify.ts`, which is the worker's reading of Coolify and no proof of it. The PR lists each Coolify API call the command makes, with the page of Coolify's API docs or the source file it was read from, and the Coolify version read. It says plainly that the command hasn't run against a real Coolify. Use the calls `robkit deploy` already makes wherever they are enough.

**Blocked by:** 02, 12

**Status:** ready-for-agent

- [ ] A deploy re-run after core failed on the first try deploys core, and the new app's role exists afterwards
- [ ] An existing core whose last deploy failed after its variables were saved is deployed again on the re-run
- [ ] An existing app that gains a `migrate` script deploys core
- [ ] A push after a failed or cancelled run deploys the apps the earlier push changed, whatever `TURBO_SCM_BASE` says
- [ ] When the branch moves during a deploy, the run after it deploys the app again and leaves core's settings matching it
- [ ] An app whose recorded commit is no longer in history deploys, and so does one whose record is missing or can't be read
- [ ] A failed, cancelled or timed-out deploy leaves the application's record as it was
- [ ] When saving a record fails, the command fails and the next run deploys that app
- [ ] When core's settings can't be saved or core's deploy fails, no app deploys and the output names the apps held back
- [ ] With a shared variable missing on the host, `robkit deploy` names it, prints no value and deploys nothing
- [ ] An application in another environment with the same name is neither changed nor reported
- [ ] Deleting an app's folder deploys core with the shorter `ROBKIT_APPS`, and names the app's application as matching no app
- [ ] Core's saved variables hold no `ROBKIT_DOMAIN`, and `robkit deploy` sends no call that deletes or replaces a variable it didn't set
- [ ] `--dry-run` with credentials names each app's action and reason and sends Coolify no write. Without them it prints the variables and says the reasons need the host
- [ ] The template's workflow cancels in-progress runs for pull requests and never for `main`, and sets no `TURBO_SCM_BASE`
- [ ] `docs/deploy.md` states the TLS requirement and the one arrangement supported, and says how to delete a removed app's application
- [ ] The changeset names `create-robkit`, and says what to change in an existing install's `ci.yml` and that the first deploy afterwards deploys every app
- [ ] The PR lists each Coolify API call with where it was read, and says the command hasn't run against a real Coolify
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

Found while milestone 1 was built (2026-11-09):

- After ticket 02 core reads only `ROBKIT_CORE_URL`. `robkit deploy` still sets `ROBKIT_DOMAIN` on core, and core ignores it. `docs/deploy.md` says so. Stop setting it on core here, since this ticket already works out which settings each app needs.

### From milestone 3, added by the lead

Milestone 3 changed none of `robkit deploy`'s code. It added to the install's `docs/deploy.md` where an app's own settings go in production (ticket 17).

The docs site is being built beside this milestone, on the `docs-site` branch. Its Deploy page (docs-site ticket 25) waits for this ticket to reach `main`, and its command reference (docs-site ticket 20) describes `robkit deploy` as it is before this ticket. Say in this ticket's comments what an owner sees differently afterwards: the reasons in the dry run, the missing-variable message, the application that matches no app. Write the TLS requirement into the install's `docs/deploy.md`, as "What to build" asks, since the Deploy page is written from that file. The docs site's last build ticket (26) works from this ticket's comments.

### From the ticket round, 2026-11-11

Opus 5.5 and Sol 6.1 read this ticket at `e5b1692d`. The lead checked each point in the code and rewrote the ticket once.

Taken:

- Both: the dry run can't give a reason without reading the host, and today it reads no credentials (`robkit-command.ts`). It now reads Coolify when it has them.
- Both: "Coolify's own certificates" can't work with the `http://` domains `robkit deploy` writes (`desiredApp` in `coolify-deploy.ts`). The runbook names the tunnel alone.
- Both: the first design leaned on Coolify behaviour no test here can see. Opus's simpler shape replaces it: one record on the application, written after a finished deploy, and nothing pinned.
- Sol: a missing or unreadable record never proves an app unchanged, a record is never written for a deploy that didn't finish, and a failed save fails the command.
- Sol: a failed core step let the apps deploy anyway, since `deploy` puts only the deploy steps into waves.
- Sol: `findApp` matches a repository and a name across every application the token can see.
- Opus: an existing install keeps a workflow that sets `TURBO_SCM_BASE`, so the command ignores it.
- Both: criteria for an app that is gone, for `ROBKIT_DOMAIN`, and for variables an owner added.

Not taken:

- **Pin each deploy to the checkout's commit and verify what Coolify built (Sol).** Coolify's deploy call takes no commit. Pinning means setting the commit on the application, which changes what Coolify's own Redeploy button builds, and no test here can see whether a build honours it. The record makes the next run repair a mismatch instead.
- **Support Coolify's own certificates with a setting (Sol).** That is a new arrangement to build and test, not a fix. The runbook says it isn't supported, and the map lists it.
- **R runs a deploy against a real Coolify before this merges (Opus).** A worker's PR can't wait on that. The PR says what wasn't proved, and R's first deploy, with `--dry-run` first, is the test. The lead tells R.
