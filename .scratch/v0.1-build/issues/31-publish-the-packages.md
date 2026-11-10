# 31: Publish the packages to npm

**What to build:** `npm create robkit` works without a robkit checkout: the `@robkit/*` packages and `create-robkit` are on npm, an install takes them from there, and `robkit vendor` is no longer needed to deploy. Ticket 11 made each package build to JS and point its packed exports there, and a repo check packs each one. What's left is naming, versioning, the release flow, and shipping the catalog inside `create-robkit`, since the generator reads it from the checkout it runs from.

**Blocked by:** 11

**Status:** done

- [x] `npm create robkit` with no checkout writes an install that installs, runs `pnpm dev` and builds
- [x] The catalog an install gets ships inside `create-robkit`
- [ ] A release publishes every package at one version, and an install's Docker build takes them from npm (moved to just-use-it ticket 14, which builds the release. The publish itself waits for R.)
- [ ] The production e2e passes on an install from the registry rather than vendored tarballs (waits for the first release; see the closing note)

**Open:**

- The npm scope, the CLI's name, the licence, versioning and the release flow. The map lists these under "Not yet specified".
- pnpm 11 refuses packages published in the last day, so an install made right after a release fails to install. Whether the release waits a day, or installs exempt `@robkit/*` and `create-robkit`.

Source: the build of ticket 11 (2026-11-03)

Notes from ticket 19:

- A yarn install can't deploy from vendored tarballs yet. yarn ties a `file:` path to the workspace that names it (`::locator=…` in `yarn.lock`), and turbo 2.11.10 can't prune that lockfile: "Unable to find any locator". Once the packages are on npm, add a yarn install to `test:production`. Until then `tooling/e2e/src/yarn-prune.test.ts` serves the packed packages from a local registry and checks the prune and the frozen install.

## Comments

### R's answers, 2026-11-09

- The names stay `create-robkit` and `@robkit/*`. Both are free on npm, and the licence is MIT, as `LICENSE` says.
- Every package releases at one version, and the first release is 0.1.0.
- Versions change through a pull request, and the publish is a workflow someone starts by hand. Everything up to the publish gets built and tested from a local registry; R adds the npm token and triggers the first release.
- An install exempts `@robkit/*` and `create-robkit` from pnpm's one-day rule, so an install made on release day installs.

The work is [just-use-it ticket 13](../../just-use-it/issues/13-create-robkit-outside-the-checkout.md) (create-robkit outside the checkout, an install from a registry) and [ticket 14](../../just-use-it/issues/14-release-workflow.md) (the release workflow). Ticket 14 closes this one.

### From just-use-it ticket 13, 2026-11-10

- The first two criteria are built: create-robkit carries the catalog in its build, and `npm create robkit` with no checkout writes an install that installs, runs `pnpm dev` and builds. `tooling/e2e/src/registry.test.ts` proves it against a local registry.
- The exemption is built: an install's `pnpm-workspace.yaml` lists `@robkit/*` and `create-robkit` under `minimumReleaseAgeExclude`. pnpm 11.28.9 lets a young package through by default and adds it to that list itself. Only with `minimumReleaseAgeStrict` does it refuse, so the test runs strict.
- The production e2e stays on vendored tarballs until the first release.

### Closed by just-use-it ticket 14, 2026-11-10

[Ticket 14](../../just-use-it/issues/14-release-workflow.md) builds the release, so this ticket closes.

- Every package releases at one version. `.changeset/config.json` holds them in one fixed group, and the first release is 0.1.0.
- `pnpm release:version` opens the version pull request, and `.github/workflows/release.yml` publishes what npm lacks when R starts it from `main`. CONTRIBUTING.md's "Releasing" is the runbook.
- Nothing is published yet. R adds the npm token and starts the first release, after ticket 19 merges.
- The production e2e still runs on vendored tarballs. Moving it to the registry, and adding a yarn install to it as the note above says, waits for the first release. It needs a ticket of its own then.
