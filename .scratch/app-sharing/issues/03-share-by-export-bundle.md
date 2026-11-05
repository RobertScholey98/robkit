# 03: Share apps as export bundles (approach A)

**What to build:** `pnpm robkit export <slug>` turns an install's app into a standalone, self-contained app repo outside the install. `pnpm robkit import <path or git URL>` brings one into any install. A snapshot model: each export is a copy, and exporting again updates the same repo with a new commit.

**Export** writes, by default, to a sibling folder of the install (`../<slug>`, or `--out <dir>`):

- the app's own files
- `shared/`: R's idea. Any code the app imports from outside its folder (the install's `packages/ui`, `packages/theme`, `packages/core-client` or anything else in the workspace) is copied in, with the imports mapped to it, so the repo stands alone. `@robkit/*` packages aren't copied; they're the contract every install provides.
- concrete versions in place of `catalog:` and `workspace:`, so the repo installs on its own
- its migrations and an optional seed file, never data
- a manifest that names the app, its stack, icon, default access, description and the robkit contract version it was made for
- a short README that says how to import it
- `git init` and a commit, if the folder isn't a repo yet

**Import** copies the app into `apps/<slug>` (`--as <slug>` to rename, refused if taken), maps `shared/` back onto the install's own packages where they're the same and keeps the rest inside the app, turns versions the catalog already has back into `catalog:` and adds new ones to it, installs, and refuses an app made for a contract version the install can't run, saying why. The app's schema, migrations and seed then come up through the provision step, as for any other app. The seed runs once, when the app's schema is first made, never again.

**Stack-agnostic:** export and import read the workspace's imports and manifests, not a stack's file layout. Both stacks pass, and a new stack would need no change here.

**For R to test tomorrow:** a sample app repo that lives outside any install (for example a guestbook, with a seed), and a `TESTING.md` at the worktree's root with copy-paste commands for R's whole acceptance test: create install A from this worktree, import the sample, add an app, change its frontend and its schema (with a new migration), export it, create install B, import it, and see the change and the seed there. Say where WSL is needed.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `pnpm robkit export <slug>` writes a repo that installs, lints, typechecks and tests on its own
- [ ] Code from outside the app's folder ends up in `shared/`, imports mapped to it
- [ ] `pnpm robkit import <path|git URL>` adds the app to a fresh install, and a guest opens it from the launcher
- [ ] A schema change made in install A reaches install B as a migration; the seed runs once
- [ ] Both stacks export and import
- [ ] Exporting again commits the change to the same repo; importing a newer export of an app already there says what to do
- [ ] An app made for a contract version the install can't run is refused with a clear message
- [ ] A sample app repo and `TESTING.md` exist, and R's acceptance test passes end to end in a test

**Answered (R, 2026-11-05):** R leans toward this approach. Schema plus an optional seed travels, never data.

Source: [App sharing PRD](../PRD.md)
