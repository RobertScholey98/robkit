# 31: Publish the packages to npm

**What to build:** `npm create robkit` works without a robkit checkout: the `@robkit/*` packages and `create-robkit` are on npm, an install takes them from there, and `robkit vendor` is no longer needed to deploy. Ticket 11 made each package build to JS and point its packed exports there, and a repo check packs each one. What's left is naming, versioning, the release flow, and shipping the catalog inside `create-robkit`, since the generator reads it from the checkout it runs from.

**Blocked by:** 11

**Status:** needs-info

- [ ] `npm create robkit` with no checkout writes an install that installs, runs `pnpm dev` and builds
- [ ] The catalog an install gets ships inside `create-robkit`
- [ ] A release publishes every package at one version, and an install's Docker build takes them from npm
- [ ] The production e2e passes on an install from the registry rather than vendored tarballs

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
