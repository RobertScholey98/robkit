# 13: create-robkit runs outside the checkout

**What to build:** `npm create robkit` can't work once published. `packages/create-robkit/src/robkit-repo.ts` reads the catalog, the pnpm version, every package's version and the lint policy from the robkit checkout three folders up, and the published package holds none of them. The pack check passes anyway, because it only looks for the export and bin files ([review](../research/review-2026-11-09.md), "create-robkit and dev"). This ticket takes v0.1 ticket 31's first two criteria; ticket 14 takes the release.

- **create-robkit carries what it needs.** Its build writes the catalog, `packageManager`, each `@robkit/*` package's version, the lint policy's files and the Go module's source into the package. Outside a checkout the generator reads that. With `--link` it reads the checkout, as today. One function hides which.
- **An install from the registry.** Without `--link`, the install's catalog names each `@robkit/*` package and `create-robkit` at the version create-robkit was built with, and needs no overrides and no `robkit vendor`.
- **The Go module travels with the install.** init and `robkit add` write robkit's Go module to the install's `vendor/robkit/go` when they write a Go app, and the app's `go.mod` reaches it with the `replace` it has today. So robkit's module is never fetched, and nothing waits on a Go proxy or a tag for it. The app's other modules, such as pgx, still come from the public proxy, with the default `-mod=readonly`. A linked install still points at the checkout.
- **pnpm's release-age rule.** pnpm 11 refuses a package published in the last day. An install's `pnpm-workspace.yaml` exempts `@robkit/*` and `create-robkit` from it, so an install made on release day installs. This answers ticket 31's open question; record it there.
- **The proof, outside Docker.** A test packs every published package, serves them from a local registry, and runs the packed `create-robkit` in a folder outside the repo with no checkout in reach. For every stack the install must install, pass its own `lint`, `typecheck` and `test`, and build.
- **The production test stays on vendored tarballs.** A `docker build` can't reach a registry on the host without more machinery than it is worth, and until R publishes, `robkit vendor` is how a real install deploys. Switching the production test to the registry waits for the first release; say so in the comments.
- **The tarballs hold only what ships.** Every published package's `files` leaves out robkit's own tests: `*.test.ts`, `*.test-d.ts` and `src/test`. create-robkit's `templates` keep theirs, since they are an install's tests. Every manifest has `license` and `repository`. The pack check fails on one of robkit's own test files in a tarball, and on a template test going missing.
- **`robkit vendor` stays**, for a linked install that deploys. Fix its two faults while here: copy the Go module before rewriting the settings, and run `pnpm pack` with an argument list, not a shell string.

**Blocked by:** 09, 10, 11, 12

**Status:** ready-for-agent

- [ ] The packed `create-robkit`, run outside the repo against a local registry, writes an install that installs, lints, typechecks, tests and builds, for every stack
- [ ] A Go app in that install builds with no `GOFLAGS`; with its other modules already in the cache it builds with `GOPROXY=off`, and `go list -m` shows robkit's module replaced by `vendor/robkit/go`
- [ ] `--link` still reads the checkout, and the whole-stack test still uses it
- [ ] An install from the registry has no overrides for robkit's packages
- [ ] No published tarball holds one of robkit's own test files, create-robkit's still holds its templates' tests, and each manifest has `license` and `repository`
- [ ] `robkit vendor` re-runs cleanly after a failed copy, and works in a folder whose path has a space or a `$`
- [ ] The production test still passes on vendored tarballs
- [ ] v0.1 ticket 31 records the answers and points here
- [ ] The PR's CI `gate` job passes on GitHub
