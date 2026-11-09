# 12: create-robkit runs outside the checkout

**What to build:** `npm create robkit` can't work once published. `packages/create-robkit/src/robkit-repo.ts` reads the catalog, the pnpm version, every package's version and the lint policy from the robkit checkout three folders up, and the published package holds none of them. The pack check passes anyway, because it only looks for the export and bin files ([review](../research/review-2026-11-09.md), "create-robkit and dev"). This ticket takes v0.1 ticket 31's first two criteria; ticket 13 takes the release.

- **create-robkit carries what it needs.** Its build writes the catalog, `packageManager`, each `@robkit/*` package's version and the lint policy's files into the package. Outside a checkout the generator reads that. With `--link` it reads the checkout, as today. One function hides which.
- **An install from the registry.** Without `--link`, the install's catalog names each `@robkit/*` package and `create-robkit` at the version create-robkit was built with, and needs no overrides and no `robkit vendor`. The Go stack's `go.mod` requires the Go module at that version with no `replace`. R hasn't tagged the module yet, so the Go case is tested with `GOFLAGS=-mod=mod` and a `GOPROXY` the test serves, or the nearest thing that proves the `go.mod` is right; say which in the comments.
- **pnpm's release-age rule.** pnpm 11 refuses a package published in the last day. An install's `pnpm-workspace.yaml` exempts `@robkit/*` and `create-robkit` from it, so an install made on release day installs. This answers ticket 31's open question; record it there.
- **The proof.** A test packs every published package, serves them from a local registry, and runs the packed `create-robkit` in a folder outside the repo with no checkout in reach. The install must install, pass its own `lint` and `typecheck`, and build. The production test then runs on an install made this way and not from vendored tarballs.
- **The tarballs hold only what ships.** Every published package's `files` leaves out `*.test-d.ts` and `src/test`. Every manifest has `license` and `repository`. The pack check fails on a test file in a tarball.
- **`robkit vendor` stays**, for a linked install that deploys. Fix its two faults while here: copy the Go module before rewriting the settings, and run `pnpm pack` with an argument list, not a shell string.

**Blocked by:** 08, 09, 10, 11

**Status:** ready-for-agent

- [ ] The packed `create-robkit`, run outside the repo against a local registry, writes an install that installs, lints, typechecks and builds, for every stack
- [ ] `--link` still reads the checkout, and the whole-stack test still uses it
- [ ] An install from the registry has no overrides for robkit's packages and no `vendor` folder
- [ ] The production test passes on an install from the local registry
- [ ] No published tarball holds a test file, and each manifest has `license` and `repository`
- [ ] `robkit vendor` re-runs cleanly after a failed copy, and works in a folder whose path has a space or a `$`
- [ ] v0.1 ticket 31 records the answers and points here
- [ ] The PR's CI `gate` job passes on GitHub
