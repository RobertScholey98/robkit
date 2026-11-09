# 14: A release is a pull request and a button

**What to build:** There is no way to release robkit. `.changeset/README.md` says so, and over a hundred changeset entries wait. R wants everything up to the publish ready, and will add the npm token and trigger the first release himself (2026-11-09). This ticket takes the rest of v0.1 ticket 31.

- **One version for every package.** `.changeset/config.json` fixes `create-robkit` and every `@robkit/*` package to one version, so an install's packages always match.
- **Versions change through a pull request.** `main` takes no direct push: its ruleset wants a pull request and the `gate` check. So `changeset version` runs on a branch, and its result goes in as a "Version packages" pull request like any other. Say in the runbook how to make it: one command, or a workflow that opens it.
- **The first release is 0.1.0.** Every waiting changeset is a patch and every package is at 0.0.0, which would give 0.0.1. Add one minor changeset for the fixed group.
- **The publish is a button.** `.github/workflows/release.yml` starts only by hand and only on `main`. It runs the full gate, builds, publishes every package at the version `main` holds, with provenance, and pushes a tag for the release. It pushes no commit.
- **The token.** npm's trusted publishing needs the package to exist first, so the first publish uses an `NPM_TOKEN` secret. The runbook says how to move to trusted publishing after it. The publish job runs in a GitHub environment, `release`, that R creates and can put a required reviewer on. Until the environment and its secret exist, the workflow fails at the publish step having changed nothing.
- **A dry run that CI runs.** A script does everything the publish does short of publishing: it packs each package, checks every version agrees, and checks nothing at that version is already on the registry. The pull-request job runs it, so it is proven before the workflow is ever started, and the workflow calls the same script. GitHub can't start a by-hand workflow from a branch, so the proof can't be a run of the workflow itself.
- **Pinned actions.** The workflow names each action by commit, with the version in a comment, since it holds a publish token.
- **The runbook.** `CONTRIBUTING.md` gains a "Releasing" section: the one-time setup (the npm scope, the environment, the token), the version pull request, the dry run, the button, and how to check the result with `npm create robkit@latest`.
- **Ticket 31 closes.** Its remaining criteria move here or are marked done, with a note that the publish itself waits for R.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] `changeset version` on the current changesets gives every package 0.1.0
- [ ] The dry-run script passes in CI on this PR, and its log shows each package's version and tarball
- [ ] The dry run fails when two packages' versions differ, with a test that shows it
- [ ] The workflow can start only by hand, publishes only from `main`, and its publish step needs the `release` environment
- [ ] A repo check fails if a published package is missing from the fixed group
- [ ] `CONTRIBUTING.md` has the releasing runbook, and `.changeset/README.md` no longer says there is no release
- [ ] v0.1 ticket 31 is closed with a pointer here
- [ ] The PR's CI `gate` job passes on GitHub
