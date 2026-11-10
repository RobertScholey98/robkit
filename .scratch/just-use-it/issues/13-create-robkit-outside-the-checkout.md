# 13: create-robkit runs outside the checkout

**What to build:** `npm create robkit` can't work once published. `packages/create-robkit/src/robkit-repo.ts` reads the catalog, the pnpm version, every package's version and the lint policy from the robkit checkout three folders up, and the published package holds none of them. The pack check passes anyway, because it only looks for the export and bin files ([review](../research/review-2026-11-09.md), "create-robkit and dev"). This ticket takes v0.1 ticket 31's first two criteria; ticket 14 takes the release.

- **create-robkit carries what it needs.** Its build writes the catalog, `packageManager`, each `@robkit/*` package's version, the lint policy's files and the Go module's source into the package. Outside a checkout the generator reads that. With `--link` it reads the checkout, as today. One function hides which. `create-robkit#build` in `turbo.json` names the files it takes in as inputs, so a cached build can't ship an old catalog.
- **An install from the registry.** Without `--link`, the install's catalog names each `@robkit/*` package and `create-robkit` at the version create-robkit was built with, and needs no overrides and no `robkit vendor`.
- **The Go module travels with the install.** init and `robkit add` write robkit's Go module to the install's `vendor/robkit/go` when they write a Go app, and the app's `go.mod` reaches it with the `replace` it has today. That holds for the first Go app added to an install that had none. So robkit's module is never fetched, and nothing waits on a Go proxy or a tag for it. The app's other modules, such as pgx, still come from the public proxy, with the default `-mod=readonly`. A linked install still points at the checkout.
- **pnpm's release-age rule.** pnpm 11 refuses a package published in the last day. An install's `pnpm-workspace.yaml` exempts `@robkit/*` and `create-robkit` from it, so an install made on release day installs. This answers ticket 31's open question; record it there. The rule guards against a package that was taken over and published again, and the exemption gives that up for robkit's own packages. Say so in `SECURITY.md`. Check too what `pnpm create robkit` does on release day: it runs outside any install, so no exemption applies to create-robkit itself. If pnpm refuses it, the README says to use `npm create robkit`, and why.
- **The proof, on the host.** A test packs every published package, serves them from a local registry, and runs the command a new owner runs, `npm create robkit@<version> <folder>` with `--registry` set to the local one, in a folder outside the repo with no checkout in reach. So npm finds the packed package and runs its bin. For every stack the install must install, pass its own `lint`, `typecheck` and `test`, and build. pnpm's release-age rule stays on for it: the registry's packages are seconds old, which proves the exemption.
- **`pnpm dev` runs in it once.** The whole-stack test makes its installs with `--link`, and the production test runs each `start` script. Neither runs `pnpm dev` in an install whose packages come from `node_modules`, which is what every new owner does first. There `robkit-dev`, `robkit-core serve` with no watcher, `robkit-migrate` and `robkit()` all resolve from installed packages. So for one stack the test starts `pnpm dev` in the registry install and checks that the hub and the example answer. This part needs Postgres, so it runs with the tests that have Docker.
- **The production test stays on vendored tarballs.** A `docker build` can't reach a registry on the host without more machinery than it is worth, and until R publishes, `robkit vendor` is how a real install deploys. Switching the production test to the registry waits for the first release; say so in the comments.
- **The tarballs hold only what ships.** Every published package's `files` leaves out robkit's own tests: `*.test.ts`, `*.test-d.ts` and `src/test`. create-robkit's `templates` keep theirs, since they are an install's tests. Every manifest has `license` and `repository`, and every tarball holds the repo's `LICENSE`, which no package folder has today. The pack check fails on one of robkit's own test files in a tarball, and on a template test going missing.
- **`robkit vendor` stays**, for a linked install that deploys. Fix its two faults while here: copy the Go module before rewriting the settings, and run `pnpm pack` with an argument list, not a shell string.

**Blocked by:** 09, 10, 11, 12

**Status:** ready-for-agent

- [ ] `npm create robkit@<version>`, run outside the repo against a local registry with pnpm's release-age rule on, writes an install that installs, lints, typechecks, tests and builds, for every stack
- [ ] A Go app in that install builds with no `GOFLAGS`; with its other modules already in the cache it builds with `GOPROXY=off`, and `go list -m` shows robkit's module replaced by `vendor/robkit/go`
- [ ] `robkit add` of a Go app, in a registry install that had none, writes `vendor/robkit/go`, and the app builds
- [ ] `create-robkit#build` names the catalog, the packages' manifests, the lint policy and the Go module as inputs in `turbo.json`
- [ ] In the registry install of one stack, `pnpm dev` brings up the hub and the example, and the example answers the owner once signed in
- [ ] `--link` still reads the checkout, and the whole-stack test still uses it
- [ ] An install from the registry has no overrides for robkit's packages
- [ ] No published tarball holds one of robkit's own test files, create-robkit's still holds its templates' tests, each manifest has `license` and `repository`, and each tarball holds `LICENSE`
- [ ] `SECURITY.md` says what the release-age exemption gives up, and the Proof says what `pnpm create robkit` did against packages under a day old
- [ ] `robkit vendor` re-runs cleanly after a failed copy, and works in a folder whose path has a space or a `$`
- [ ] The production test still passes on vendored tarballs
- [ ] v0.1 ticket 31 records the answers and points here
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **Four packages are new**: `@robkit/provision`, `@robkit/drizzle`, `@robkit/vite` and `@robkit/serve`. Read the list of published packages from `packages/`. Don't write it out.
- **Four packages ship a command** through `publishConfig.bin`: `robkit-core` (`@robkit/core`), `robkit-migrate` (`@robkit/drizzle`), `robkit-dev` (`@robkit/dev`) and create-robkit's own. An install's scripts call them by name, so the registry proof runs each.
- **The `/testing` entries ship.** `src/testing.ts` in `@robkit/guard`, `@robkit/hono` and `@robkit/express`, and the same entry in the Next and Start adapters, is what an owner's tests import. The `files` rule (`*.test.ts`, `*.test-d.ts`, `src/test`) doesn't match it. The pack check should say each `/testing` entry is in its tarball.
- **`withDependencies` in the generator** (ticket 12) links or packs the packages behind the ones an install names. From a registry pnpm resolves those itself, so that code serves `--link` and `robkit vendor` only.
- **Every Node stack has a `test` script** (ticket 08), so "pass its own test" runs real tests.
- **The `pnpm dev` bullet and its criterion are new**, added by the lead with this note. Nothing ran that path before.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Neither had a must-change here. I checked each point against the code and took these:

- **`create-robkit#build` has no entry in `turbo.json`** (Opus). `create-robkit#test` names its inputs and the build doesn't, so a build that starts reading the catalog would be cached across a catalog change.
- **The proof runs `npm create robkit@<version>`** (Opus), not the packed bin by its path. That is the one step a path can't prove.
- **The release-age rule stays on in the proof, and its trade is written down** (both).
- **A Go app added to an install with no Go app** (Sol) has its own criterion.
- **No package folder has a `LICENSE`** (Opus), so no tarball has one. npm packs it only from the package's own folder.
- **The `pnpm dev` run needs Docker** (Sol), so "outside Docker" was the wrong heading for the proof.
