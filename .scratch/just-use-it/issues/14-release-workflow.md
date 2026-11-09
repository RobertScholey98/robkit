# 14: A release is a pull request and a button

**What to build:** There is no way to release robkit. `.changeset/README.md` says so, and over a hundred changeset entries wait. R wants everything up to the publish ready, and will add the npm token and trigger the first release himself (2026-11-09). This ticket takes the rest of v0.1 ticket 31.

- **One version for every package.** `.changeset/config.json` fixes `create-robkit` and every `@robkit/*` package to one version, so an install's packages always match.
- **Versions change through a pull request.** `main` takes no direct push: its ruleset wants a pull request and the `gate` check. So `changeset version` runs on a branch, and its result goes in as a "Version packages" pull request like any other. Say in the runbook how to make it: one command, or a workflow that opens it.
- **The first release is 0.1.0.** Every waiting changeset is a patch and every package is at 0.0.0, which would give 0.0.1. Add one minor changeset for the fixed group.
- **The publish is a button.** `.github/workflows/release.yml` starts only by hand and only on `main`. It runs the full gate, builds, and publishes with provenance every package whose version on `main` isn't on npm yet, as `changeset publish` does. So a publish that stopped halfway can be run again. It pushes a tag for the release, and no commit.
- **It publishes through pnpm.** Only pnpm rewrites `publishConfig`'s `exports` and `bin`, `workspace:*` and `catalog:` as it packs. Say so in the workflow, and check the packed manifests in the dry run.
- **The token.** npm's trusted publishing needs the package to exist first, so the first publish uses an `NPM_TOKEN` secret. The runbook says how to move to trusted publishing after it. The publish job runs in a GitHub environment, `release`, that R creates and can put a required reviewer on. Until the environment and its secret exist, the workflow fails at the publish step having changed nothing.
- **A dry run that CI runs.** A script packs each package as the publish would and checks what is in the tarballs: every version agrees, every manifest's exports point at built files, and no `workspace:` or `catalog:` is left. It makes no call to npm, so the gate doesn't depend on the registry and an ordinary pull request passes after a release as before. The pull-request job runs it, and the workflow runs it before publishing. GitHub can't start a by-hand workflow from a branch, so the proof can't be a run of the workflow itself.
- **create-robkit ships its changelog.** Its `files` includes `CHANGELOG.md`, which `changeset version` writes, so `robkit upgrade` (ticket 19) can print what changed.
- **Pinned actions.** The workflow names each action by commit, with the version in a comment, since it holds a publish token.
- **The runbook.** `CONTRIBUTING.md` gains a "Releasing" section: the one-time setup (the npm scope, the environment, the token), the version pull request, the dry run, the button, and how to check the result with `npm create robkit@latest`.
- **Ticket 31 closes.** Its remaining criteria move here or are marked done, with a note that the publish itself waits for R.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] `changeset version` on the current changesets gives every package 0.1.0
- [ ] The dry-run script passes in CI on this PR with no call to npm, and its log shows each package's version and tarball
- [ ] The dry run fails when two packages' versions differ, and when a packed manifest still says `workspace:` or `catalog:`, with a test for each
- [ ] The workflow can start only by hand, publishes only from `main`, skips a version already on npm, and its publish step needs the `release` environment
- [ ] A repo check fails if a published package is missing from the fixed group
- [ ] `CONTRIBUTING.md` has the releasing runbook, and `.changeset/README.md` no longer says there is no release
- [ ] v0.1 ticket 31 is closed with a pointer here
- [ ] The PR's CI `gate` job passes on GitHub
