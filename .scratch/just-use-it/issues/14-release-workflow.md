# 14: A release is a pull request and a button

**What to build:** There is no way to release robkit. `.changeset/README.md` says so, and over a hundred changeset entries wait. R wants everything up to the publish ready, and will add the npm token and trigger the first release himself (2026-11-09). This ticket takes the rest of v0.1 ticket 31.

- **One version for every package.** `.changeset/config.json` fixes `create-robkit` and every `@robkit/*` package to one version, so an install's packages always match.
- **Versions change through a pull request.** `main` takes no direct push: its ruleset wants a pull request and the `gate` check. So `changeset version` runs on a branch, and its result goes in as a "Version packages" pull request like any other. One command makes it: `pnpm release:version` cuts a branch, runs `changeset version`, commits, pushes and opens the pull request with `gh`. Its body names this ticket, so the pull request's ticket check passes. No workflow opens it. GitHub starts no checks on a pull request that a workflow's own token opened, so `gate` would never run and the pull request could never merge.
- **The first release is 0.1.0.** Every package is at 0.0.0. Milestones 1 and 2 added minor changesets, so with the fixed group `changeset version` should already give 0.1.0. Check that it does, and add one minor changeset for the group only if it doesn't. A repo check fails on a `major` changeset while the version is under 1.0.0, since one would make the first release 1.0.0.
- **The publish is a button.** `.github/workflows/release.yml` starts only by hand, and stops at once on any ref but `main`. It runs the full gate, builds, and publishes with provenance every package whose version on `main` isn't on npm yet, as `changeset publish` does. So a publish that stopped halfway can be run again. Once every package is on npm it pushes one tag, `v<version>`, and no commit.
- **It publishes through pnpm.** Only pnpm rewrites `publishConfig`'s `exports` and `bin`, `workspace:*` and `catalog:` as it packs. Say so in the workflow, and check the packed manifests in the dry run.
- **The token.** npm's trusted publishing needs the package to exist first, so the first publish uses an `NPM_TOKEN` secret. The runbook says how to move to trusted publishing after it. The publish job runs in a GitHub environment, `release`, that R creates, limits to `main` and can put a required reviewer on. Until the environment and its secret exist, the workflow fails at the publish step having changed nothing.
- **Only the publish step holds the token.** The gate runs every dev dependency's code, so the job that runs it has no secret and read-only permissions. `id-token: write` and `contents: write` are on the publish job alone, and `NPM_TOKEN` is in the environment of its one publish step. That job checks the token is there before it publishes anything, and stops with a line that says what is missing.
- **A dry run that CI runs.** It packs each package as the publish would and checks what is in the tarballs: every version agrees, every manifest's `exports` and `bin` point at files the tarball holds, no `workspace:` or `catalog:` is left, and the versions create-robkit carries (ticket 13) are the versions packed. `packProblems` in `tooling/repo-checks/src/published.ts` packs every package and checks its targets already. Build on it and add no second packer. It makes no call to npm, so the gate doesn't depend on the registry and an ordinary pull request passes after a release as before. The pull-request job runs it, and the workflow runs it before publishing. The workflow refuses any ref but `main`, so this pull request can't run it. The proof is the dry run and tests that read the workflow file.
- **create-robkit ships its changelog.** Its `files` includes `CHANGELOG.md`, which `changeset version` writes, so `robkit upgrade` (ticket 19) can print what changed.
- **What an owner must do goes in that changelog.** A changeset writes only to the changelogs of the packages it names. So a change in `@robkit/hono` that an owner has to act on isn't in create-robkit's changelog unless its changeset names create-robkit too. `CONTRIBUTING.md` gains the rule: a change an owner must do something about, in any package or in a file an install copies, names create-robkit in its changeset and says what to do.
- **Pinned actions.** The workflow names each action by commit, with the version in a comment, since it holds a publish token.
- **The runbook.** `CONTRIBUTING.md` gains a "Releasing" section: the one-time setup (the npm scope, the environment, the token), the version pull request, the dry run, the button, and how to check the result with `npm create robkit@latest`. It says the first release waits for ticket 19: 0.1.0's half of `robkit upgrade` can't change once it is on npm.
- **Ticket 31 closes.** Its remaining criteria move here or are marked done, with a note that the publish itself waits for R.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] `changeset version` on the current changesets gives every package 0.1.0
- [ ] The dry-run script passes in CI on this PR with no call to npm, and its log shows each package's version and tarball
- [ ] The dry run fails when two packages' versions differ, when a packed manifest still says `workspace:` or `catalog:`, when an `exports` or `bin` target isn't in its tarball, and when a version create-robkit carries isn't the one packed, with a test for each
- [ ] `pnpm release:version` makes the version commit on a new branch, and the pull request body it writes passes the ticket check
- [ ] The workflow can start only by hand, stops on any ref but `main`, and its publish job needs the `release` environment; tests read the workflow file for each
- [ ] No job but the publish job has write permissions, and no step but the publish step has `NPM_TOKEN`, with a test that reads the workflow file
- [ ] With no `NPM_TOKEN`, the publish job stops before it publishes anything and says what is missing
- [ ] A test shows the publish list for a release that stopped halfway: the packages already on npm are left out, and the tag waits for the last one
- [ ] A repo check fails if a published package is missing from the fixed group, and on a `major` changeset while the version is under 1.0.0
- [ ] `CONTRIBUTING.md` has the releasing runbook and the rule for a change an owner must act on, and `.changeset/README.md` no longer says there is no release
- [ ] v0.1 ticket 31 is closed with a pointer here
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **`packages/` has 15 published packages now.** The fixed group and its repo check read the list from `packages/`.
- **49 of the 223 waiting changeset entries are minor.** The ticket said every one was a patch, which was true when it was written. The 0.1.0 bullet above is changed to match.
- **Four packages have a `bin` in `publishConfig`**: `@robkit/core`, `@robkit/drizzle`, `@robkit/dev` and create-robkit. The dry run now checks `bin` as it checks `exports`.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Each had one must-change here, and I took both.

- **A workflow can't open the version pull request** (Opus, must-change). A pull request opened with a workflow's `GITHUB_TOKEN` starts no workflow runs. `main`'s ruleset needs `gate` (`tooling/repo-checks/src/branch-rules.recorded.json`), so that pull request could never merge. The ticket had left "one command, or a workflow" open. It is one command now.
- **The token reaches one step** (Sol, must-change). The ticket put the publish job in an environment and said nothing of which steps see the secret, or which jobs can write.
- **"GitHub can't start a by-hand workflow from a branch" was wrong** (both). It can, from any branch that holds the workflow file. So the workflow checks its ref, and R limits the environment to `main`.
- **Taken as written above**: one tag after the last package (Opus), the `major` check (Opus), building on `packProblems` and checking the versions create-robkit carries (Opus), the halfway-release test (Sol), the changelog rule (both), and the note that the first release waits for ticket 19 (Opus).

Not taken:

- **Run `pnpm publish --provenance --dry-run` in CI** (Opus). Provenance needs the publish job's identity token, which the gate must not have. The first real publish is the proof, and R runs it.
