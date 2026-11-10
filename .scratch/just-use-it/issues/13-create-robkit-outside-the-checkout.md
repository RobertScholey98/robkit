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

**Status:** done

- [x] `npm create robkit@<version>`, run outside the repo against a local registry with pnpm's release-age rule on, writes an install that installs, lints, typechecks, tests and builds, for every stack
- [x] A Go app in that install builds with no `GOFLAGS`; with its other modules already in the cache it builds with `GOPROXY=off`, and `go list -m` shows robkit's module replaced by `vendor/robkit/go`
- [x] `robkit add` of a Go app, in a registry install that had none, writes `vendor/robkit/go`, and the app builds
- [x] `create-robkit#build` names the catalog, the packages' manifests, the lint policy and the Go module as inputs in `turbo.json`
- [x] In the registry install of one stack, `pnpm dev` brings up the hub and the example, and the example answers the owner once signed in
- [x] `--link` still reads the checkout, and the whole-stack test still uses it
- [x] An install from the registry has no overrides for robkit's packages
- [x] No published tarball holds one of robkit's own test files, create-robkit's still holds its templates' tests, each manifest has `license` and `repository`, and each tarball holds `LICENSE`
- [x] `SECURITY.md` says what the release-age exemption gives up, and the Proof says what `pnpm create robkit` did against packages under a day old
- [x] `robkit vendor` re-runs cleanly after a failed copy, and works in a folder whose path has a space or a `$`
- [x] The production test still passes on vendored tarballs
- [x] v0.1 ticket 31 records the answers and points here
- [x] The PR's CI `gate` job passes on GitHub

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

### From the build, 2026-11-10

Chosen in the build:

- **create-robkit keeps what it carries in `dist/carried.json`.** Its build runs `scripts/carry.ts` after `tsc`. `readRobkitRepo()` in `src/robkit-repo.ts` reads that file when it exists and `--link` isn't set, and the checkout otherwise. The source has no `dist`, so tests and the checkout's own `pnpm create-install` read the checkout.
- **The proof serves the packages from a small registry of its own.** `tooling/e2e/src/registry.ts` is about 150 lines of `node:http`, with no new dependency. It packs every package under `packages/` with `pnpm pack` and serves each as published the moment it was packed, so pnpm's release-age rule sees it as seconds old. It answers only robkit's packages and redirects every other request to npm, so the install's other packages come from where an owner's would. A real registry such as Verdaccio would need a pinned dev dependency, a config and a publish step for each package, for no more proof.
- **One registry install covers every stack.** Its example is on Start, and `robkit add` gives it an app on React + Hono, Express, Next and Go. The Go app is the install's first, so it also proves `robkit add` writes `vendor/robkit/go`. A second install, with its example on Go, proves init writes it.
- **`@internal/e2e#test` waits for `@internal/repo-checks#typecheck`**, which builds every published package, since the registry test packs their `dist`.
- **`vendor/` is in an install's `.prettierignore`**, so the copied Go module's README doesn't fail the format check.

What the build found:

- **pnpm packs the repo's `LICENSE`** into a package that has none, so the packages need no copies. The pack check fails on a tarball without it.
- **pnpm 11.28.9 doesn't refuse a young package by default.** It lets it through and adds it to `minimumReleaseAgeExclude` in the install's settings itself. Only with `minimumReleaseAgeStrict` does it refuse, with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. So the registry test runs strict, and checks that a project without the exemption fails while the install doesn't, and that pnpm added nothing to the install's settings.
- **`pnpm create robkit@<version>`** on a create-robkit published seconds before worked by default, and failed under strict with `ERR_PNPM_NO_MATURE_MATCHING_VERSION create-robkit@0.0.0 was published at ...`. create-robkit's README says to use `npm create robkit` if pnpm refuses it.
- **pnpm reads `pnpm_config_registry`, not `npm_config_registry`.** npm passed `--registry` to create-robkit's bin, but the install's `pnpm install` needed pnpm's own setting.
- **`robkit vendor` now runs `pnpm pack` with an argument list** and finds each tarball by the name pnpm gives it, so pnpm's output shows as it packs instead of printing as JSON.

The registry test took about 100 seconds alone in WSL with a warm pnpm store and Go cache: packing, two `npm create`s, two installs, four `robkit add`s, the install's lint, typecheck, test and build, and one `pnpm dev`. Beside the whole-stack test, which `test` runs at the same time, it took about 265 seconds.

The production test stays on vendored tarballs. Switching it to the registry waits for the first release.

For the next tickets:

- **14 (release):** `packProblems` in `tooling/repo-checks/src/published.ts` now also fails on one of robkit's own tests in a tarball, a missing `LICENSE`, and a manifest without `license` or `repository`. `templateTestProblems` fails on a template test going missing. `packRobkit` and `serveRobkit` in `tooling/e2e/src/registry.ts` pack and serve every package, for a dry run of the release.
- **15 (init installs):** init's own `pnpm install` must pass the registry to pnpm as `pnpm_config_registry` or `--registry`, since pnpm ignores npm's setting. The registry test runs `pnpm install` itself after `npm create`; once init installs, it can drop that step.
- **19 (`robkit upgrade`):** `readRobkitRepo()` gives what create-robkit carries: the catalog, each package's version, the lint policy and the Go module. `writeGoModule` in `src/go-module.ts` replaces an install's `vendor/robkit/go` whole.

### Merged

Added by the lead. PR 90 merged into `m3-making-an-install` on 2026-11-10, with `gate`, `check`, `production` and `pull-request` green on `32b9d24`. Its first `production` run timed out on a test this ticket didn't change, which builds four images inside a 300-second limit. That test has 900 seconds now, and ticket 25 has the note.

The release-age bullet above says pnpm refuses a package under a day old. The build found it doesn't by default, and pnpm's docs agree. It holds a young version back while an older one fits, and takes it where nothing else does. It refuses only once the install sets `minimumReleaseAge` or `minimumReleaseAgeStrict`. After the merge I reworded `SECURITY.md` and the comment in the install's `pnpm-workspace.yaml` to say that.
