# 13: A release workflow

**What to build:** There is no way to release robkit. `.changeset/README.md` says so, and 57 changesets wait. R wants everything up to the publish ready, and will add the npm token and trigger the first release himself (2026-11-09). This ticket takes the rest of v0.1 ticket 31.

- **One version for every package.** `.changeset/config.json` fixes `create-robkit` and every `@robkit/*` package to one version, so an install's packages always match.
- **The workflow.** `.github/workflows/release.yml` runs only when someone starts it by hand. It runs the full gate, applies the changesets, builds, publishes every package to npm with provenance, tags the Go module as `go/v<version>` on the same commit, and pushes the version commit and tags. It uses npm's trusted publishing if that works for a first publish of new names, or else an `NPM_TOKEN` secret; say which in the comments. A dry-run input does everything but publish and push.
- **It can't publish by accident.** The job needs a GitHub environment, `release`, that R creates and can put a required reviewer on. Until the environment and its secret exist, the workflow fails at the publish step and has changed nothing.
- **Pinned actions.** The workflow names each action by commit, with the version in a comment, since it holds a publish token.
- **The first release is 0.1.0.** Check what the waiting changesets would make of the versions, and adjust so the first release comes out as 0.1.0 for every package.
- **The runbook.** `CONTRIBUTING.md` gains a "Releasing" section: the one-time setup (the npm scope, the environment, the token or trusted publisher), how to run a dry run, how to release, and how to check the result with `npm create robkit@latest`.
- **Ticket 31 closes.** Its remaining criteria move here or are marked done, with a note that the publish itself waits for R.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] A dry run of the workflow on the milestone's branch passes, and its log shows what each package's version and tarball would be
- [ ] `changeset version` on the current changesets gives every package 0.1.0
- [ ] The workflow can start only by hand, and its publish step needs the `release` environment
- [ ] A repo check fails if a published package is missing from the fixed group
- [ ] `CONTRIBUTING.md` has the releasing runbook, and `.changeset/README.md` no longer says there is no release
- [ ] v0.1 ticket 31 is closed with a pointer here
- [ ] The PR's CI `gate` job passes on GitHub
