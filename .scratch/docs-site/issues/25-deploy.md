# 25: Deploy

**What to build:** The deploy guide for the one path robkit supports: Coolify on the owner's server, as the install's `docs/deploy.md` describes it.

It waits for ticket 22 of "Just use it", which changes what `robkit deploy` deploys and prints, and writes the TLS requirement into `docs/deploy.md`. Today that file doesn't state it. Build this once milestone 4 has merged to `main` and `main` has been merged into `docs-site`.

- What to set up once, in order, and what each step is for.
- **Claim it at once.** Whoever opens a new install first becomes its owner. The guide says to claim the hosted install straight after the first deploy, and to check the setup page is gone.
- `pnpm robkit deploy`, its dry run with the reason it gives for each app, and what it prints.
- **Three kinds of value.** What the deploy command itself reads (`COOLIFY_URL`, `COOLIFY_TOKEN` and the rest), the shared variables on the host, and each app's own settings.
- What needs TLS in front, and what breaks without it.
- What the guide doesn't cover: other hosts, backups, observability and secret rotation. It says so plainly.

**Blocked by:** 03, 05; ticket 22 of "Just use it", merged into this branch

**Status:** ready-for-agent

- [ ] Every step and command on the page is in the install's `docs/deploy.md` or in the code as ticket 22 left them, and the PR's Proof names the commit read
- [ ] Every name `robkit deploy` reads is on the page, and every name on the page is one it reads or sets
- [ ] The page says to claim the install at once, and how to check it is claimed
- [ ] The page says what it doesn't cover
- [ ] The PR's CI `gate` job passes on GitHub
