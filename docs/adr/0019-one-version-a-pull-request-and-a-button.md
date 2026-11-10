# 0019: One version for every package, released by a pull request and a button

**Status:** accepted, 2026-11-09 (R), in [Publish the packages](../../.scratch/v0.1-build/issues/31-publish-the-packages.md), and built by [A release is a pull request and a button](../../.scratch/just-use-it/issues/14-release-workflow.md), 2026-11-10. What the build chose awaits R's review. Nothing is published yet.

## Context

robkit had no way to release, and over a hundred changeset entries waited. An install takes create-robkit and every `@robkit/*` package it uses. `main` takes no direct push: its ruleset wants a pull request and the `gate` check. GitHub starts no checks on a pull request that a workflow's own token opened, so such a pull request could never merge.

## Decision

- **One version.** `.changeset/config.json` fixes `create-robkit` and `@robkit/*` to one version, so an install's packages always match, and a new package joins with no edit. The first release is 0.1.0. A repo check fails on a `major` changeset while the version is under 1.0.0.
- **Versions change through a pull request.** `pnpm release:version`, run from a clone, cuts `release-v<version>`, runs `changeset version`, and opens "Version packages as <version>" with `gh`. No workflow opens it.
- **The publish is a button.** `.github/workflows/release.yml` starts only by hand and stops on any ref but `main`. It runs the full gate, packs, and publishes with provenance each package whose version on `main` isn't on npm yet, dependencies first, through pnpm, which rewrites `publishConfig`, `workspace:*` and `catalog:` as it packs. Once every package is there it pushes one tag, `v<version>`. A publish that stopped halfway can run again.
- **Only the publish step holds the token.** The gate runs every dev dependency's code, so its job has no secret and read-only permissions. `NPM_TOKEN` reaches the one publish step, in a `release` environment that R limits to `main`.

## Consequences

- CI's pull-request job runs `pnpm release:dry-run`, which packs every package as the publish would and checks the tarballs, with no call to npm.
- create-robkit ships its `CHANGELOG.md`, so `robkit upgrade` can print what changed. A change an owner must act on names create-robkit in its changeset, whatever package it is in. `CONTRIBUTING.md` says so.
- The first publish uses a token, because npm's trusted publishing needs the package to exist first. `CONTRIBUTING.md`'s "Releasing" says how to move to trusted publishing after it.
- The first release waits for upgrade's frozen handover ([0021](0021-upgrade-runs-in-two-steps.md)), since 0.1.0's half of it can't change once it is on npm.
