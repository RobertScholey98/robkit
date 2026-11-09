# 18: Deploys don't skip

**What to build:** Two paths leave an app undeployed with nothing to say so ([review](../research/review-2026-11-09.md), "Core is redeployed only" and "A cancelled or failed run on main skips deploys").

- **Core redeploys when its settings change.** `robkit deploy` reads core's variables before it patches them, and deploys core whenever `ROBKIT_DATABASES` or `ROBKIT_APPS` differ, not only in the run that creates an app. An app with no finished deployment counts as new. So a first deploy that failed halfway finishes on the re-run, and an app that gains a `migrate` script gets its role.
- **The install's CI deploys what hasn't been deployed.** The template's workflow stops cancelling runs on `main`. `robkit deploy` works out what changed since the last commit it deployed, which it records on the host or in the repo; choose where and say why. A push that fixes a failed check deploys everything since the last good deploy, not only its own diff.
- **The runbook says what it needs.** The install's `docs/deploy.md` says a TLS terminator in front of Coolify is required, names the two it is written for (a Cloudflare tunnel, or Coolify's own certificates), and says what breaks without one. After ticket 01 the guard no longer reads `X-Forwarded-Proto`, so the Traefik note isn't needed; check the runbook for anything else that assumed it.
- **A dry run shows the plan.** `robkit deploy --dry-run` prints what it would deploy and why each one: new, changed, or core's settings changed.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A deploy re-run after core failed on the first try deploys core, and the new app's role exists afterwards
- [ ] An existing app that gains a `migrate` script deploys core
- [ ] Two pushes to `main` in quick succession deploy both pushes' apps
- [ ] A push after a failed check deploys the apps the failed push changed
- [ ] `--dry-run` names each app it would deploy and the reason
- [ ] `docs/deploy.md` states the TLS requirement
- [ ] The PR's CI `gate` job passes on GitHub
