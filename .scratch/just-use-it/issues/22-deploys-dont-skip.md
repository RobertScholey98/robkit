# 22: Deploys don't skip

**What to build:** Two paths leave an app undeployed with nothing to say so ([review](../research/review-2026-11-09.md), "Core is redeployed only" and "A cancelled or failed run on main skips deploys"). Both come from `robkit deploy` not knowing what the host is actually running.

- **robkit records what a finished deploy applied.** After an app's deploy finishes, and only then, `robkit deploy` records on the host the commit it deployed, per Coolify application. Use Coolify's own record of the deployment if it holds the commit, or a variable robkit sets; choose and say why. For core it also records which `ROBKIT_APPS` and `ROBKIT_DATABASES` that deploy ran with. Nothing is written to the repo: the install's CI can't push, and shouldn't.
- **Saved isn't deployed.** `robkit deploy` saves an app's variables on Coolify before it deploys, so the saved variables can't say what core is running. Core deploys whenever the settings it is about to save differ from the ones its last finished deploy recorded. So a first deploy whose core step failed finishes on the re-run, an existing core whose replacement failed is retried, and an app that gains a `migrate` script gets its role.
- **Each app deploys from its own last good commit.** `robkit deploy` works out what changed for each app since the commit recorded for it, not since `github.event.before`. A push that fixes a failed check deploys what the failed push changed, and two pushes in quick succession lose nothing.
- **The install's CI stops cancelling `main`.** The template's workflow keeps `cancel-in-progress` for pull requests only.
- **The runbook says what it needs.** The install's `docs/deploy.md` says a TLS terminator in front of Coolify is required, names the two it is written for (a Cloudflare tunnel, or Coolify's own certificates), and says what breaks without one.
- **A dry run shows the plan.** `robkit deploy --dry-run` prints what it would deploy and why each one: new, changed since which commit, or core's settings changed.

**Blocked by:** 02, 12

**Status:** ready-for-agent

- [ ] A deploy re-run after core failed on the first try deploys core, and the new app's role exists afterwards
- [ ] An existing core whose last deploy failed after its variables were saved is deployed again on the re-run
- [ ] An existing app that gains a `migrate` script deploys core
- [ ] A push after a failed or cancelled run deploys the apps the earlier push changed
- [ ] `--dry-run` names each app it would deploy and the reason
- [ ] The template's workflow cancels in-progress runs for pull requests and never for `main`
- [ ] `docs/deploy.md` states the TLS requirement
- [ ] The PR's CI `gate` job passes on GitHub
