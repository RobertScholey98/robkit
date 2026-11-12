# 72: A vendored install moves to a released robkit

**What to build:** Split from [ticket 70](70-a-vendored-install-can-take-a-newer-robkit.md) on 2026-11-12. Once robkit is on npm, an install that runs the tarballs `robkit vendor` packed has no way onto the registry. `robkit upgrade` stops at any override that names a file (`notFromRegistry` in `packages/create-robkit/src/upgrade.ts`). The deploy guide tells every owner who deploys before the release to vendor, so each of those installs ends up here.

- **One command moves the install to a released robkit.** It removes robkit's overrides, moves every robkit entry in the catalog to the released version, installs, and then removes the tarballs.

What the council round on ticket 70 found, each checked in the code:

- **The catalog holds every robkit package at the vendored version**, 0.0.0 before the release (`generate.ts`). `handOver` moves only create-robkit's entry (`upgrade-handover.ts`). With the overrides gone, `pnpm install` would ask the registry for `@robkit/core@0.0.0`, which it doesn't have. So the overrides and every robkit entry move together.
- **A failure leaves a vendored install that works.** `putBack` restores the paths in `ownedPaths`, and the tarballs aren't among them. So the tarballs go last, once the install has succeeded.
- **`vendor/robkit/go` stays.** A Go app builds against it on npm too.
- **Overrides that aren't robkit's stay.**
- **`upgrade-handover.ts` freezes when 0.1.0 is on npm**, and its first step names no package but create-robkit, so a later robkit can drop or rename any other.

**Recommended:** the released robkit does the move in one step, and no handover is involved. Only it knows which packages it has and at what version. `robkit upgrade` in a vendored install asks the registry whether it has the running robkit's own version. If it has, the command moves the install to that version. If it hasn't, the command prints how to run a released robkit in the install, such as with `pnpm dlx`. That leaves `upgrade-handover.ts` alone, and it works for an install vendored before this code existed, the robscholey.com install included. The builder proves the command against the repo's local registry before the docs name it.

**Blocked by:** 70

**Status:** done

- [x] A vendored install moves to a released robkit with one command, and a test holds it against the repo's local registry
- [x] The test's install was vendored by a robkit without this code, as robscholey.com was
- [x] A move that fails at `pnpm install` leaves the overrides, the catalog and the tarballs as the last commit has them, and a test holds it
- [x] After the move, `vendor/robkit` holds no tarball, a Go app's `vendor/robkit/go` is still there, and an override that isn't robkit's is unchanged
- [x] `robkit upgrade` in a vendored install whose robkit the registry doesn't have prints a command that works
- [x] "Upgrading robkit" says how
- [x] The changeset names create-robkit

## Comments

### Chosen in the build, 2026-11-12

- The move runs the second step's work whole, with `finish` in `upgrade.ts`. So besides the lint policy and the Go module, it adds or raises the other catalog entries this robkit needs and raises `packageManager`, as any upgrade does. robkit's own entries are set to this robkit's versions, not raised, as the design says.
- A given version must be the running robkit's own. Any other is refused before anything runs, with the `pnpm dlx --package create-robkit@<version> robkit upgrade` that runs it.
- The checks run before the registry is asked, as for any upgrade. A vendored install with a change not committed is refused first.
- npm has no create-robkit today, so `pnpm view` answers 404 (`ERR_PNPM_FETCH_404`). In a vendored install that counts as "the registry doesn't have it" and gets the two-step line. Any other failure still says it couldn't ask the registry. An install on the registry sees no change.
- The command to name is `pnpm dlx --package create-robkit robkit upgrade`, with no version, so it runs the registry's newest. It ran against the local registry with `minimumReleaseAgeStrict` on, inside a vendored install, and ran the registry's robkit, not the one in `vendor/robkit`.
- Ctrl+C during `pnpm install` puts the files back too, as the handover does: the move outlives the SIGINT that stops pnpm.
- It removes every tarball directly in `vendor/robkit`, whether an override names it or not, and leaves the folder for `vendor/robkit/go`. The summary names the tarballs as one line, `vendor/robkit: removed robkit's tarballs`.
- It prints no changelog. The vendored code isn't a release, so no range of versions fits it.
- The whole-stack test builds its vendored install by hand, the way `robkit vendor` wrote one before this change: made by `npm create robkit` at the packed version, then each tarball copied to `vendor/robkit` with an override naming it. The robkit inside those tarballs is this code, which the test uses to print the line. The move itself is made by the registry's robkit through `pnpm dlx`, so the vendored robkit's code plays no part in it, as for robscholey.com.
- `upgrade-handover.ts` is unchanged.

### Proof

- Before the change, in WSL against the local registry: a vendored install's `pnpm robkit upgrade` and `pnpm dlx --package create-robkit@0.0.1 robkit upgrade` both printed "Vendor again from a newer robkit checkout to update them."
- create-robkit's `upgrade.test.ts`, 71 tests in WSL: the move, its summary, `vendor/robkit` holding only `go` afterwards with the Go module replaced, the overrides left as `styled-jsx>@babel/core` alone, a failed `pnpm install` and a Ctrl+C each leaving `git status` clean, the line for a registry with no create-robkit and for one with a newer robkit only, a refused version, and the checks first. The Ctrl+C test fails with the SIGINT handler taken out.
- `tooling/e2e`'s `vendored-upgrade.test.ts`, 5 tests in 46 seconds: the vendored robkit prints the line, the test runs the `pnpm dlx` command it names, and the install then has every robkit entry at the registry's version, no robkit override, no tarball, the registry's Go module and lint policy, installs from its lockfile and builds.
- In WSL: `pnpm format:check`, `pnpm knip`, create-robkit's lint, typecheck and tests with their coverage thresholds, e2e's lint and typecheck, and repo-checks' glossary, site fences and doc examples all pass.

### From the code round, 2026-11-12

Opus 5.5 and Sol 6.1 each scored the pull request 8/10. Four findings held up against the code and were fixed:

- The move could lower an install's version (both reviewers). `pnpm dlx` can fetch a robkit older than the one the install packed from a checkout, and the move set the catalog to the running robkit's version whatever it held. It now refuses before it changes a file, and names the version to wait for. The test failed first with "promise resolved".
- The move deleted an owner's override such as `@robkit/core>postgres` (Sol). It matched overrides by name. It now deletes only the overrides whose value names a tarball in `vendor/robkit`. The test failed first with the override gone.
- Two doc lines were untrue for the move (Opus). The upgrade page said the new robkit installs again only when the catalog changed, and the Coolify page gave `--from` to an install whose robkit refuses it.
- The changeset is `minor`, as the one for `vendor --from` is (Opus).

Not taken:

- A vendored robkit at the release's own version supplies its own lint policy and Go module, so those two could differ from the release's (Opus). Telling the install's robkit from one `pnpm dlx` fetched would depend on where pnpm keeps packages. `git diff` shows what the move wrote.
- The 404 branch is proven only by the fake pnpm (Opus). pnpm 11.28.9 against a registry answering 404 printed `ERR_PNPM_FETCH_404` and exited 1, which is what the code reads.
- A failure while removing the tarballs, after `pnpm install` succeeded, leaves some behind (Opus). The install works either way, and the owner can delete the rest.
- Moving the e2e helper out of the hook commit (Opus). The commit is pushed.
