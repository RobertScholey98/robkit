# 10: Deploy

**What to build:** The deploy guide for the one path robkit supports today: Coolify on the owner's server, as the install's `docs/deploy.md` describes it.

- What to set up once, in order, and what each step is for.
- `pnpm robkit deploy`, its dry run, and what it prints.
- What each app needs on the host: its database URL and its own settings.
- What needs a TLS terminator in front, and what breaks without one.
- What the guide doesn't cover: other hosts, backups, observability and secret rotation. It says so plainly.

Each page follows "The words" in the [PRD](../PRD.md): written for a person, checked against the code and not only against a repo doc, in the glossary's terms. Milestone 4 of "Just use it" changes `robkit deploy` (ticket 22). Write to the code on this branch, and note in the ticket's comments what ticket 22 will change.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Every step and command on the page is in the install's `docs/deploy.md` or in the code, and the PR's Proof names which
- [ ] Every setting the page names is one `robkit deploy` reads or sets
- [ ] The page says what it doesn't cover
- [ ] The ticket's comments list what ticket 22 of "Just use it" will change on the page
- [ ] The PR's CI `gate` job passes on GitHub
