# 19: `robkit upgrade`

**What to build:** Milestone 2 moves platform logic out of an install's files and into packages so that a fix reaches an install by a version bump ([ADR 0008](../../../docs/adr/0008-packages-update-apps-are-owned.md)). Nothing does the bump. An owner would have to know which lines of `pnpm-workspace.yaml` are robkit's, and which copied files go with them.

- **Two steps, because the old robkit doesn't know the new one.** `pnpm robkit upgrade` runs the robkit the install already has. That one can't hold the new version's Go module, lint policy or catalog needs. So:
  1. The installed robkit sets the catalog's entries for `create-robkit` and every `@robkit/*` package to the new version, and runs `pnpm install`.
  2. It then hands over by running `pnpm robkit upgrade --finish <old version>`, which the newly installed robkit answers. That one refreshes the copies of robkit's own files the install holds (`vendor/robkit/go` when the install has a Go app, and the lint policy in `tooling/eslint`), adds or raises any catalog entry its packages need, raises `packageManager` to its own pnpm where the install's is older, and installs again if it changed either.
- **The handover can't change.** Once 0.1.0 is on npm, its step 1 calls `upgrade --finish <old version>` on every later robkit, for as long as anyone upgrades from 0.1.0. So that call, its one argument and the state step 1 leaves for it are public, like an export. The repo keeps a copy of what 0.1.0's step 1 does, and a test runs the current step 2 after it. `--finish` isn't in the usage text: an owner never types it.
- **It checks everything before it changes anything.** It refuses, with what to do, when:
  - git isn't installed, or the install has no commit. init skips the first commit where git has no name set (ticket 15), so this isn't rare. The message gives the three commands that make one.
  - the tree has an uncommitted change or an untracked file.
  - the version given isn't in the registry, or isn't newer than the installed one. It moves forward only, and says so for the same version. With no version given, the newest is the registry's `latest` for create-robkit.
  - `tooling/eslint` or `vendor/robkit/go` is a link. It overwrites both whole and follows no link.
  - `pnpm dev` is running in the install. An upgrade swaps the packages under every running app, so it says to stop `pnpm dev` first.
- **A failure puts the files back.** Each step changes files and then runs `pnpm install`, which can fail: no network, or a version pnpm can't resolve. Upgrade then restores every file it changed from the last commit, removes what it added under the two folders it owns, says which step failed and why, and says to run `pnpm install` to put `node_modules` back. The tree was clean when it started, so everything changed is its own. The owner is never left with a tree that upgrade's own check refuses.
- **Git is the undo.** It overwrites robkit's copies whole, and ends by saying to read `git diff` and commit. The install's README gives the commands that undo an upgrade by hand, for one that was killed partway.
- **What it writes, and no more.** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packageManager` in the root `package.json`, `tooling/eslint` and `vendor/robkit/go`. In the catalog it raises an entry that is lower than the new version needs and adds one that is missing. It never lowers or removes one, so an entry the owner added stays.
- **Apps, the hub and admin are the owner's.** It never rewrites them. It prints create-robkit's changelog entries between the two versions, which is where a change the owner must make by hand is written: `CONTRIBUTING.md` has that rule since ticket 14, and ticket 14 ships the changelog in the package.
- **It says what it did.** The old and new version, what it changed, and to run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- **A linked install** has nothing to upgrade, and says so. So does a vendored one, whose catalog points at tarballs `robkit vendor` wrote: its line says to vendor again from a newer checkout.
- **Docs.** The install's README and `AGENTS.md`, and create-robkit's README.

**Blocked by:** 13, 14, 15, 18

**Status:** done

- [x] With two versions in the local registry, `robkit upgrade` moves an install from the older to the newer, and the install then installs, lints, typechecks and builds
- [x] A catalog entry the newer version's packages need, and the older install lacks or holds too low, is there afterwards, an entry the owner added is unchanged, and `packageManager` is the newer version's
- [x] `robkit upgrade <version>` moves to that version, and refuses one the registry doesn't have, the installed one and an older one, each with a message that says so
- [x] It refuses, and changes nothing, with no git, with no commit, with an uncommitted change and with an untracked file
- [x] It refuses, and changes nothing, while `pnpm dev` runs in the install
- [x] With `pnpm install` made to fail in step 1, and in another test in step 2, the tree is as it was at the last commit, the message names the step, and a second `robkit upgrade` then succeeds
- [x] A test runs step 1 as 0.1.0 does it, from a copy kept in the repo, and the current step 2 finishes the upgrade
- [x] `vendor/robkit/go` and the lint policy match the new version afterwards, and no file under `apps/` changed
- [x] It prints the changelog entries between the two versions
- [x] In a linked install, and in a vendored one, it prints one line and changes nothing
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **An app's files now call packages by name**: `guarded()`, `appDatabase(schema)`, `robkit-migrate`, `robkit()` or `withRobkit()`, and `serve(app)`. `apps/core` is a `package.json` whose scripts are `robkit-core start`, `migrate` and `serve`. Those names are public, like an export, and a later version keeps them. So upgrade has nothing to rewrite under `apps/`, and the criterion "no file under `apps/` changed" holds for core too.
- **What an install still holds of robkit's own, outside `apps/`**: the root `Dockerfile`, `compose.yaml`, `turbo.json`, `.github`, `tooling/eslint` and `vendor/robkit/go`. This ticket rewrites the last two. A fix to one of the others reaches an install through the changelog, by hand. Say so in the install's README, so an owner knows which files a version bump doesn't cover.

### From the ticket round, 2026-11-10

Opus 5.5 and Sol 6.1 read milestone 3's tickets at `a314729`. Both raised the same two faults, so both count.

- **"Every install starts with a commit" wasn't true** (both). Ticket 15 skips the commit where git has no name or isn't installed, and `--no-install` makes none. Upgrade now checks for one.
- **A failed step left a tree that upgrade's own check refused** (both). Step 1 changes the catalog and the lockfile before `pnpm install` can fail, so a second run saw uncommitted changes and stopped. Opus asked for a second run that accepts upgrade's own changes, and Sol for a recovery at each step. I chose the one that needs no rule about whose changes are whose: a failure puts the files back, so every run starts clean.
- **The handover between the two steps is a contract** (Opus, must-change). The ticket had the old robkit "run the newly installed robkit to finish" and didn't say how. Whatever 0.1.0 calls, every later version must answer. It has a name and a test now. Opus suggested the public `robkit upgrade <version>` run again as the handover. I gave it its own flag, because step 2 must run on a tree that step 1 has changed, and the public command refuses one.
- **Taken as written above**: checks before any change, forward only (Sol), `latest` as the newest (Opus asked what "newest" means; ticket 13 exempts robkit's packages from pnpm's release-age rule, so `latest` installs on release day), `packageManager` (both), the two folders and no links (Sol), owner catalog entries kept (Sol), and a vendored install (Opus).
- **This ticket now waits for 18** (both). Both change `robkit-command.ts`, the install's README and `AGENTS.md`, and the whole-stack test.
- **The first release waits for this ticket.** Ticket 14's runbook says so. 0.1.0's step 1 can't change once it is on npm.

### From the lead, after ticket 18, 2026-11-10

- **Upgrade refuses while `pnpm dev` runs.** Ticket 18's build asked what an upgrade should do to a running install, and the ticket didn't say. I chose a refusal, as one more check before any change. An upgrade runs `pnpm install` twice and replaces the lint policy and the Go module, under apps that have already loaded the old packages. The check is in step 1, so it is in the half that can't change after 0.1.0. A refusal is the side to be wrong on: a later version can't relax it for an install on 0.1.0, but that owner only has to stop `pnpm dev`. R hasn't seen this choice yet.
- **How to tell.** The runner listens on a socket file (ticket 18). `devSocket` in `@robkit/dev/cli` gives its path, and something answering there is a running `pnpm dev`. `askDev` sends an add or a migrate, which upgrade must not send. So `@robkit/dev/cli` needs one more export that only connects and closes. On native Windows `pnpm dev` doesn't run (ticket 21), and the answer is no.

### From the build

**The handover, as 0.1.0 will ship it.** The ticket fixed the call and its argument. These details it left open, and the build chose them. Each is frozen once 0.1.0 is on npm, so R should read them before the first release:

- **Step 1 calls `pnpm exec robkit upgrade --finish <old version>`**, not `pnpm robkit ...`. The install's `robkit` script is the owner's to rename, and `pnpm exec` finds the bin whatever the script is called.
- **Step 1 sets only the robkit entries the catalog already has** (`create-robkit` and every `@robkit/*` there) to the new version. Adding the entries a new version needs is step 2's job.
- **Step 1's `pnpm install` takes `--no-frozen-lockfile`**, so a CI-like environment with `frozen-lockfile` set doesn't refuse the change step 1 just made.
- **Step 2 must exit non-zero when it fails.** Step 1 treats any non-zero exit as a failed step 2, puts every file back, and says "Step 2 of robkit upgrade failed: robkit X couldn't finish it." Step 2 prints its own reason first.
- **How a file goes back is part of step 1**: `git ls-tree --name-only HEAD` on `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`, `tooling/eslint` and `vendor/robkit/go`, then `git checkout HEAD --` on those it lists, then `git clean -fdq --` on the five. Step 2 puts back the same way before it exits, and step 1 does it again after. Doing it twice changes nothing.
- **The checks run in step 1**, which lives in `upgrade.ts`, not in the frozen file. 0.1.0's checks are whatever 0.1.0's `upgrade.ts` has: a later robkit can't add a check for an install on 0.1.0, only step 2 can refuse.
- **The frozen copy is the live file.** `src/upgrade-handover.ts` is what step 1 runs today, and its first comment says it is frozen and why. A test checks its sha256, so an edit fails the build until someone means it. To change step 1 after 0.1.0, copy the file, point `upgrade.ts` at the copy, and leave this one for the handover test. The file imports only `node:` modules, `yaml`, and `exec` and `CommandProblem` from `@robkit/dev/cli`, and loads nothing after `pnpm install`, which replaces the packages under it.

**Chosen in the build, awaiting R's review:**

- **`devRunning(root)` in `@robkit/dev/cli`** connects to the socket and closes it, and sends nothing. On native Windows it answers false, as `pnpm dev` doesn't run there (ticket 21).
- **A linked or vendored install exits 0** with its one line. So does an install already on the newest when no version was given: "This install is on robkit X, the newest." A version given that is the installed one exits 1, as the ticket says.
- **The registry is the one the install's pnpm uses.** `pnpm view create-robkit dist-tags versions --json`, run in the install. A failed `pnpm view` gives pnpm's own reason and says to check the network and `pnpm config get registry`.
- **A version shape check comes first**, before git: "latest" isn't a version. Give one such as 0.2.0, or none for the newest.
- **The catalog is read and written with `yaml`'s document API**, so the owner's comments and the order of entries survive, then formatted with Prettier as init writes it.
- **The changelog** is create-robkit's `CHANGELOG.md` from the newer package, the `## <version>` sections after the old version up to the new one. With none, the output says so.
- **Its last lines** list each file it changed and why, the changelog, and "Next, read git diff, run pnpm lint, pnpm typecheck and pnpm test, then commit."
- **Each stack's `AGENTS.md`** has an "Upgrading robkit" section that says upgrade never rewrites the app's folder. The Go stack's names `vendor/robkit/go`.
- **The README test in `generate.test.ts`** now allows `pnpm install`, which the undo commands use.

**How the tests make a second version.** No test assumes robkit's version, pnpm's or how fast npm is.

- In `packages/create-robkit`, the newer version is `newerVersion`, the installed one's patch plus one (`src/test/robkit-version.ts`). A fake pnpm (`src/test/fake-pnpm.ts`), put first on `PATH`, answers `pnpm view` with the two versions, appends a line to `pnpm-lock.yaml` for each `install` (and fails the Nth when told to), and runs `pnpm exec robkit ...` as this checkout's `robkit-command.ts`. Step 2's tests call `finishUpgrade` with the checkout's carried files at `newerVersion` (`newerRepo()` in `upgrade.test.ts`), so the newer version is this checkout under a higher number.
- In `tooling/e2e`, `packNewer` (`src/newer-version.ts`) repacks every tarball the checkout packed at `nextPatch`. It rewrites each robkit dependency to the new version, sets every package's version in create-robkit's `dist/carried.json`, adds a known line to the lint policy's `policy.js` and to `go.mod`, and writes a `CHANGELOG.md` with an entry before and after the old version. The local registry now serves several versions of each package, with `latest` the newest. `npm create robkit@<older>` makes a Go install, the test removes `next` from its catalog, sets `express` to 4.0.0 and adds `left-pad`, commits, and runs `pnpm robkit upgrade`. It checks the catalog, the two folders, the output, then `lint`, `typecheck` and `build`, and that a second run says the install is on the newest.

**For ticket 20:**

- The map's ADR list names "upgrade's two steps, with the handover that can't change (19)". The record should cite `src/upgrade-handover.ts`, its hash test, and the choices under "The handover, as 0.1.0 will ship it" above.
- The install's README has an "Upgrade robkit" section with the undo commands, the install's `AGENTS.md` an "Upgrading robkit" one, each stack's `AGENTS.md` a short one, and create-robkit's README an "Upgrade" section for contributors. `docs/testing.md` describes the upgrade test.
- Before 0.1.0 is released, ticket 14's runbook should read the frozen file once more. After it, the hash in `upgrade-handover.test.ts` is never updated.
