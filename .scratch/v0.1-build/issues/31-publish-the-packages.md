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
