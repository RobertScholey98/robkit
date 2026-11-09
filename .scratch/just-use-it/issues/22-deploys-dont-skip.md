# 22: Deploys don't skip

**What to build:** Two paths leave an app undeployed with nothing to say so ([review](../research/review-2026-11-09.md), "Core is redeployed only" and "A cancelled or failed run on main skips deploys"). Both come from `robkit deploy` not knowing what the host is actually running.

- **robkit records what a finished deploy applied.** After an app's deploy finishes, and only then, `robkit deploy` records on the host the commit it deployed, per Coolify application. Use Coolify's own record of the deployment if it holds the commit, or a variable robkit sets; choose and say why. For core it also records which `ROBKIT_APPS` and `ROBKIT_DATABASES` that deploy ran with. Nothing is written to the repo: the install's CI can't push, and shouldn't.
- **One commit for the whole run.** Today a deploy builds whatever the branch holds when Coolify gets to it, so a push that lands mid-run puts newer code under older settings. `robkit deploy` reads the apps, saves the settings, builds and records all at the commit it ran from, if Coolify's API can pin a build to a commit. If it can't, it records the commit Coolify really built, and the comments say why the next run still brings code and settings together.
- **Saved isn't deployed.** `robkit deploy` saves an app's variables on Coolify before it deploys, so the saved variables can't say what core is running. Core deploys whenever the settings it is about to save differ from the ones its last finished deploy recorded. So a first deploy whose core step failed finishes on the re-run, an existing core whose replacement failed is retried, and an app that gains a `migrate` script gets its role.
- **Each app deploys from its own last good commit.** `robkit deploy` works out what changed for each app since the commit recorded for it, not since `github.event.before`. A push that fixes a failed check deploys what the failed push changed, and two pushes in quick succession lose nothing. When the recorded commit is gone from history, as after a force push, the app deploys.
- **It says what the host is missing.** Before it deploys anything, `robkit deploy` checks the host has each shared variable the apps refer to: `ROBKIT_DB_SECRET`, `ROBKIT_ADMIN_DATABASE_URL` and each app's database URL. It names any that are missing, with the command that prints the value. If Coolify's API can't list shared variables, say so in the comments and give the same message when the deploy fails for want of one.
- **An app that is gone.** A Coolify application that matches no app in the install is named in the output and left alone. Ticket 24 takes the app out of core's catalog; say in the runbook how to delete the application.
- **The install's CI stops cancelling `main`.** The template's workflow keeps `cancel-in-progress` for pull requests only.
- **The runbook says what it needs.** The install's `docs/deploy.md` says a TLS terminator in front of Coolify is required, names the two it is written for (a Cloudflare tunnel, or Coolify's own certificates), and says what breaks without one.
- **The dry run gives reasons.** `robkit deploy --dry-run`, which exists today, says why it would deploy each app: new, changed since which commit, or core's settings changed.

**Blocked by:** 02, 12

**Status:** ready-for-agent

- [ ] A deploy re-run after core failed on the first try deploys core, and the new app's role exists afterwards
- [ ] An existing core whose last deploy failed after its variables were saved is deployed again on the re-run
- [ ] An existing app that gains a `migrate` script deploys core
- [ ] A push after a failed or cancelled run deploys the apps the earlier push changed
- [ ] When the branch moves during a deploy, the run after it leaves every app on the newer commit and core's settings matching it
- [ ] An app whose recorded commit is no longer in history deploys
- [ ] With a shared variable missing on the host, `robkit deploy` names it and deploys nothing
- [ ] `--dry-run` names each app it would deploy and the reason
- [ ] The template's workflow cancels in-progress runs for pull requests and never for `main`
- [ ] `docs/deploy.md` states the TLS requirement
- [ ] The PR's CI `gate` job passes on GitHub
