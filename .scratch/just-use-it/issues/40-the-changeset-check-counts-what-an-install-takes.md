# 40: The changeset check counts what an install takes

**What to build:** Since [ticket 25](25-ci-checks-without-holes.md)'s code round, CI's changeset check counts a change to a file create-robkit's build carries into an install as a change to create-robkit. It reads the files from that build's inputs in `turbo.json`: `pnpm-workspace.yaml`, the root `package.json`, `tooling/eslint/*.js` and `go/**`.

The build reads more of those files than an install takes. So the check asks for a changeset on changes that reach no install:

- A script or a dev dependency in the root `package.json`. An install takes only `packageManager`.
- A catalog entry only robkit's own packages use, such as the docs site's Astro. An install takes the entries its templates name with `catalog:`.
- A lint file `policy.js` doesn't import, such as `package-graph.js`. An install takes `policy.js` and each file it imports.
- A test of the Go module. An install takes the module without its tests.

A changeset written to pass the check would put a line that means nothing to an owner in the changelog `robkit upgrade` prints. The docs site's pull requests change the root `package.json`, the catalog and `package-graph.js`.

- **Count the part an install takes.** For each carried file, the check counts a change only when it changes what create-robkit copies into an install.
- **Keep the default safe.** A carried file the check has no rule for counts whole, as today.
- **Docs.** The check's row in `tooling/repo-checks/README.md` says what it counts. That row still says a package whose version changes needs no changeset, which stopped being true in ticket 25's code round. `CONTRIBUTING.md` says which changes outside a package need a changeset naming create-robkit.

**Blocked by:** 25

**Status:** done

- [x] A change to pnpm's version, to a catalog entry a template takes, to the lint policy or a file it imports, or to the Go module still needs a changeset naming create-robkit
- [x] A change to the root `package.json`'s scripts, to catalog entries no template takes, to a lint file the policy doesn't import, or to a test of the Go module needs none
- [x] The check's row in `tooling/repo-checks/README.md` and the map say what it counts now
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- The rules are in `reachesAnInstall` in `check-changesets.ts`. Each follows the code in create-robkit that reads the file: `readCheckout` and `readLintPolicy` in `robkit-repo.ts`, `installCatalog` in `generate.ts`, and `readGoModule` in `go-module.ts`. The check doesn't call them. They aren't part of create-robkit's public API, and adding them to a published package for a repo check costs more than four short rules that a comment ties to their source.
- The check reads the names a template takes, and the files `policy.js` imports, from the checkout as it is. It doesn't read them at the base too. A name or an import that came or went changed a template or a policy file, and that change already counts.
- It counts every template's `package.json`, where `installCatalog` reads the base and the ready stacks. A stack that isn't ready yet reaches no install, so the check asks for one changeset more than it must there.
- `turbo.json` still lists the whole files, since the build reads them whole and its cache must miss when one changes.
- The four new tests failed on the old check before the change, and the five that need a changeset passed before and after.
