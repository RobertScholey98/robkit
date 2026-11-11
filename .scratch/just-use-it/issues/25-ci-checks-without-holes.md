# 25: CI checks without holes

**What to build:** Several checks pass changes they exist to catch ([review](../research/review-2026-11-09.md), "Tooling, CI and publishing"). Each fix comes with the test that shows the hole first. Where the review marks a finding unconfirmed, confirm it before fixing, and record what you found.

- **Changesets.** CI fails when a published package's source changed and no new changeset names that package, or when a template changed and no changeset names `create-robkit`. Today one changeset for any package passes. Every package is released at one version, so the name decides only whose changelog gets the words, and `robkit upgrade` prints `create-robkit`'s alone. `changedFilePatterns` also covers each package's `package.json`, `conformance.json` in `packages/guard` and `drizzle/**` in `packages/core`. Its patterns are read from each package's own folder, so write them that way, and keep the ones that leave tests out.
- **Coverage.** The threshold check fails a change to `coverage.include` or `coverage.exclude` unless it is excused in the file with a reason, and compares against the merge base, not the base branch's tip. A reason that was already there doesn't excuse a later change.
- **Go formatting.** `lint` fails on an unformatted Go file, in `go/` and in the Go template, with a fixture that proves it.
- **Two lint rules.** The "does no I/O" row also catches `globalThis.fetch` and its like. `no-bare-error` catches `throw Error("…")` without `new`.
- **Workflows.** Every action in the repo's workflows and in the template's is named by commit, with its version in a comment, and a repo check fails on one named by tag, as `release-workflow.test.ts` does for `release.yml`. The `check` and `pull-request` jobs have `timeout-minutes`.
- **The Go version.** `CONTRIBUTING.md` and the install's docs say Go 1.26 or later, `go.mod` says 1.26.0, and CI runs 1.27.3. CI tests the oldest Go the docs promise as well as the newest, or the docs promise only what CI tests.
- **Tests that call git.** They run with no global git identity, as CI's runner does: `GIT_CONFIG_GLOBAL` pointed at an empty file and `user.useConfigOnly` on, set where every machine gets it. A test that commits in a clone it didn't configure then fails on any machine, not only in CI.
- **A wrong comment.** The comment on `isCoreOrigin` in `go/session/options.go` says an address in code is judged as one from settings. It isn't: Go refuses a trailing slash that TypeScript drops. Correct the comment. Don't change either port.

**Blocked by:** 14, 22

**Status:** done

- [x] Each hole has a test that fails before its fix
- [x] A pull request that changes `@robkit/core`'s source with a changeset naming only `@robkit/input` fails CI, and so does a template change with no changeset naming `create-robkit`
- [x] A change to a package's `package.json`, to `packages/guard/conformance.json` or to a file under `packages/core/drizzle` needs a changeset, shown through the real changeset check, and a test file still needs none
- [x] Narrowing a package's coverage `include`, widening its `exclude`, or removing either, fails the threshold check without a reason, and passes with one
- [x] The threshold check gives the same answer after the base branch gains an unrelated commit
- [x] An unformatted `.go` file fails `pnpm lint` in `go/` and in a Go app
- [x] `globalThis.fetch(…)` in `@robkit/guard` fails lint, and so does `throw Error("fixed text")`
- [x] A repo check fails on any workflow, the template's included, that names an action by tag
- [x] The `check` and `pull-request` jobs each have a timeout
- [x] CI runs Go's tests on the oldest Go the docs promise and on the newest, or the docs name one version
- [x] A test that commits without setting an identity in its own clone fails on a machine that has a global one
- [x] `tooling/eslint/README.md` and `tooling/repo-checks/README.md` describe each rule and check as it now is
- [x] The PR's CI `gate` job passes on GitHub

## Comments

Found while milestone 1 was built (2026-11-09):

- Two of repo-checks' own tests hit Vitest's 30-second limit on a busy GitHub runner, once each, and passed on a rerun: the `beforeAll` in `tooling/repo-checks/src/new-package.test.ts` (PR 78, run 42719625052) and `doc-examples.test.ts` (PR 75). Each does real work in a hook or a test: it copies the repo, or builds. Give them a limit that fits the work, or make the work smaller. Don't add a retry.
- The lead gave both a 120-second limit on 2026-11-10, in ticket 10's PR. They had timed out three more times in milestone 2, once as a 25-minute CI run's only failure, and `doc-examples.test.ts` compiles every README's examples, so it slows with each new package. What is left for this ticket is to make the work smaller, if it still matters.

Found in milestone 1's code review (2026-11-10):

- A port lease whose holder and watcher were both killed is never taken back (`freePortBlock` in `tooling/test-postgres/src/index.ts`). A reboot or `wsl --shutdown` leaves every lease of that moment behind. With enough of them, 50 random tries over 500 blocks start to fail. It doesn't reach CI, where each run gets a fresh machine. Taking a stale lease over isn't a small fix: removing a lease after reading that its holder is dead can remove one a live process has just taken in its place. A lease named for both its block and its holder's pid needs no removal to be ignored, and needs no symlink, which ticket 21 also wants gone.
- The two ports read a core address with letters outside ASCII differently: TypeScript takes `https://core.bücher.de` as its punycode form, and Go refuses it. robkit's own tools never write one, since `readDomain` refuses such a domain. A `coreAddress` row in `tooling/test-session/request-cases.json` would hold the two to one answer.

Found in milestone 2's code review (2026-11-10):

- The two ports also differ on a core address written in code with a trailing slash. TypeScript's `guarded({ core: "https://core.robkit.dev/" })` reads it through `readCoreUrl`, which drops the path. Go's `session.Guarded(session.Options{Core: "https://core.robkit.dev/"})` refuses it, and the comment on `isCoreOrigin` in `go/session/options.go` says an address in code is judged as one from settings, which isn't so. Go is the stricter, so nothing is open. The same `coreAddress` rows would hold this case too.
- `packages/create-robkit/src/vendor.test.ts` timed out in pull request 89's CI: four tests that write an install and run pnpm's build and pack passed 30 seconds on a slow runner. The lead gave that group 120 seconds. They take 12 to 20 seconds on a usual runner, because seven of them run pnpm side by side. Running them one after another, or sharing one install, would make the work smaller.

Found while milestone 3 was built (2026-11-10):

- The production test's "serves an app on each other stack" timed out at 300 seconds in pull request 90's CI, with no assertion failing. It builds four images, and took 215, 229 and 245 seconds in the three green runs before it. The lead gave it the hooks' 900 seconds. That is the fourth test to fail CI on its time limit alone. A check that fails a test whose usual time is over half its limit would catch the next one before a slow runner does.
- The API report test in `tooling/repo-checks/src/api-report.test.ts` hit its 30-second limit for two workers on the lead's machine, while three full gates ran side by side. It takes 1.3 seconds alone. Workers now take turns at the full gate with a lock file. An hour later it failed pull request 92's CI too: the report for `packages/next` took 31.9 seconds. On a CI runner a report takes 3 to 25 seconds, because the suite's other files pack and build beside it, so the lead gave each 120 seconds. That is the fifth test to fail CI on its time limit alone, and the half-the-limit check above would have caught it.
- `tooling/repo-checks/src/version-pull-request.test.ts` failed pull request 92's CI because one test committed in a second clone that had no git identity. Every machine that had run it had a global identity, and CI's runner has none. Running the tests that call git with `GIT_CONFIG_GLOBAL=/dev/null` and `user.useConfigOnly=true` shows it anywhere. A check that runs them that way would catch the next one before CI does.
- Two of create-robkit's unit tests failed pull request 94's CI because each ran a real `pnpm install` from npm's registry, with 110 seconds to finish, and npm took 10 to 21 seconds a request on that runner. The lead gave them a fake pnpm ahead of the machine's own on `PATH`. The registry test in `tooling/e2e` still installs with the real one. A unit test that reaches npm's registry depends on npm's speed that minute. A check could run the unit tests with no network and fail any that needs one.
- Several tests named a version that a routine pull request changes: six named robkit's own as 0.0.0, which the version pull request changes, and three gave a fake pnpm 11.28.9 to print, which the next pnpm update changes. Each reads the number from `package.json` now. Running the tests in a copy bumped with `changeset version` showed the first six.

### From milestone 3, added by the lead

On top of the notes above, which were written as milestone 3 was built:

- **`release.yml` already names every action by commit**, with its version beside it, and `release-workflow.test.ts` holds it to that (ticket 14). The "Workflows" bullet is about `ci.yml`, `production.yml`, `nightly.yml` and the template's workflows.
- **The Go version.** Ticket 20 found the three places disagree: `CONTRIBUTING.md` and the install's docs say Go 1.26 or later, `go.mod` says 1.26.0, and CI runs 1.27.3. That is this ticket's last bullet.
- **One more test on a time limit.** `packages/create-robkit/src/vendor.pack.test.ts` timed out at 120 seconds in CI on `main`, on the merge of milestone 3 (run 42927115992). It was the run's only failure. The same tree had passed on the pull request an hour before. The lead re-ran the job.
- **A comment can fail the glossary check.** Milestone 3's code round wrote "a group of its own" in a comment in `packages/dev/src/exec.ts`, and the check failed in WSL after the unit tests had passed. It passed once "process group" sat on one line. The check is right. A contributor meets it late, since `pnpm check` runs it among 300 other tests.

### From the ticket round, 2026-11-11

The round was asked which of the comments above belong in the ticket. Taken as bullets:

- **Git identity** (both). It is concrete, and CI found it only by failing.
- **`vendor.pack.test.ts`** (Sol). It failed `main` on the day of the round, and then pull request 100, so the lead fixed it that day and it isn't a bullet here. Its two tests each build and pack every package, and ran side by side. They now run one after the other, which took each from 16 seconds to 10 on the lead's machine. In a green CI run they had taken 75 seconds each, against a limit of 120.
- **The comment on `isCoreOrigin`** (Opus).

Taken into the bullets that were there:

- Opus: every package is released at one version (`fixed` in `.changeset/config.json`), so the changeset rule is about whose changelog gets the words. `robkit upgrade` prints `create-robkit`'s alone.
- Sol: `changedFilePatterns` are read from each package's folder. Copying the review's paths from the repo's root would match nothing.
- Sol: criteria for `exclude`, for removing either field, and for the base branch moving. `check-coverage-thresholds.ts` reads the base it is given.
- Opus: pinning needs a check that stays.
- Sol: the timeout criterion names the two jobs.

Not taken, with the comment each answers:

- **A check that fails a test over half its time limit.** Both said no gate: a test's usual time has no steady value on a shared runner, so the gate would fail by itself. Opus offered a report in the job's summary. The lead left it out, since nobody would read it until a test had already failed.
- **Unit tests run with no network.** Both said drop it. The two tests that reached npm have a fake pnpm now.
- **`coreAddress` rows for an address with letters outside ASCII, or a trailing slash.** Sol asked for rows that hold both ports to one answer. Opus said drop it, and the lead agrees: Go is the stricter port, robkit's tools never write such an address, and one answer means changing what a port accepts, which is session protocol work for no owner to notice.
- **Stale port leases.** Both said not here. It never reaches CI. It is noted on [ticket 21](21-native-windows.md), which wants the same lease files changed.
- **Making the other slow tests smaller, version strings in tests, and the glossary check met late.** Each is done, or its limit fits now.

Sol would keep this ticket at high effort and Opus at medium. It stays high: it changes what CI lets into a release.

### Added by the lead during the build, 2026-11-11

- **`expect.poll` gives up after one second unless told otherwise.** About 30 polls in the repo used that default while they waited for a process to listen, a lock to be taken or a log line to appear: `serve-core.db.test.ts` gave core one second to start, and `migrate.db.test.ts`'s wait on a lock took 9.3 seconds on the lead's machine under load and 336 ms alone. These failed the gates of tickets 30, 34, 36 and 37's workers on 2026-11-11, each passing when rerun alone. Every package's tests now poll for up to 30 seconds. A poll that states its own limit, such as `{ timeout: 2_000 }` in `listen.test.ts`, keeps it.

### From the build, 2026-11-11

Each hole had a failing test first. What was found and chosen:

- **Changesets.** `changeset status` failed only when no changeset at all came with a change; with `@robkit/core` changed and a changeset naming `@robkit/input`, it passed. CI's `pull-request` job now runs `tooling/repo-checks/src/check-changesets.ts` in its place. It finds changed packages with changesets' own `@changesets/git` and new changesets with `@changesets/read`, so `changedFilePatterns` match exactly as the CLI matches them, and it fails each changed published package that no changeset added in the branch names. `check-changesets.test.ts` (renamed from `changeset-config.test.ts`) runs it on a scratch repo with the real config. The new patterns are `package.json`, `conformance.json` and `drizzle/**`, read from each package's folder.
- **Chosen in the build: the version pull request.** With `package.json` counted, `pnpm release:version`'s pull request, which bumps every version and deletes the changesets, would fail the check. A package whose `version` the branch changes needs no new changeset. A test makes a version pull request and expects a pass.
- **A cost of counting `package.json`.** A change to a dev dependency alone, as this ticket made in every package, needs a changeset naming each published package. This ticket's `.changeset/shared-test-settings.md` names fourteen, and says nothing changes for an app. If that is noise, a later ticket could count only the fields that ship.
- **Coverage.** `check-coverage-thresholds.ts` compares against `git merge-base <base> HEAD`. It reads `coverage.include` and `coverage.exclude` through TypeScript's parser, without comments or layout, and fails a change, removal or addition of either unless the config gains a `// coverage-scope: <why>` comment that the base didn't have. Chosen in the build: any change needs the reason, a widening too, since telling a narrowing from a widening of two glob lists can't be done in general.
- **Go formatting: the finding was wrong.** `gofmt -d` exits 1 when a file's formatting differs (Go's source returns `errFormattingDiffers` for `-d`), on 1.26.0 and 1.27.3, on Windows and Linux. So `lint` already failed an unformatted file. `go-lint.test.ts` runs both lint scripts on a scratch file and pins it; it went red when the script was changed to `gofmt -l .`.
- **Lint rules.** The layer rule's "does no I/O" rows now also fail `globalThis.fetch`, `window.fetch`, `self.…`, `global.…`, `globalThis["fetch"]`, and a global object that is destructured, indexed by a name the rule can't read, or passed around. Reading another property, such as `globalThis.crypto`, passes. `no-bare-error` now fails `throw Error("…")` without `new`.
- **Workflows.** Each action in `ci.yml`, `production.yml` and the template's `ci.yml` is now named by the commit its major tag pointed to on 2026-11-11, the same as `release.yml`'s. `workflows.test.ts` fails an action named by tag or branch in any of them, and a `check` or `pull-request` job without `timeout-minutes`. Chosen in the build: `check` gets 45 minutes (it takes 13 to 17) and `pull-request` 15 (it takes about one).
- **The Go version. Chosen in the build: CI tests both.** A `go-oldest` job runs `go vet` and `go test` on `go/` and on the Go template, on the version `go/go.mod` names (1.26.0), and the gate needs it. Both passed on 1.26.0 locally. `check` still tests 1.27.3. `go-version.test.ts` fails if `go/go.mod`, the template's `go.mod`, `CONTRIBUTING.md`, the templates' `AGENTS.md` and dev's "Go isn't installed" message disagree, or if no job reads `go/go.mod`.
- **Git identity and the poll limit: one place.** No file already sat in every package's test run, so this ticket made one: `@internal/vitest-config` in `tooling/vitest`, which joins the package graph's `toolchain` list, so it needs no edges. Each `vitest.config` puts `...testDefaults` first in `test`. It sets `GIT_CONFIG_GLOBAL` to `tooling/vitest/no-git-identity.gitconfig`, which holds only `user.useConfigOnly = true`, and `expect.poll.timeout` to 30 seconds. `test-defaults.test.ts` shows a commit with no identity of its own failing under a home whose `.gitconfig` has one, and a poll that needs three seconds passing; both failed before. It also fails a `vitest.config` that doesn't spread the defaults, and `pnpm new:package` writes them in. The package has no lint of its own: its lint would take eslint-config, whose tests take it, and turbo refuses the cycle.
- **`isCoreOrigin`.** The comment now says `ReadGuardEnv` cuts the setting to its origin first and `Guarded` doesn't, so Go refuses a trailing slash in code that TypeScript drops. No test can show a comment wrong.

### For the docs site

What a contributor sees differently:

- CI's `pull-request` job fails a branch that changes a published package without a changeset naming it, and names each package left out. A change to a package's `package.json`, to `packages/guard/conformance.json` or under `packages/core/drizzle` now needs one too.
- The coverage threshold check fails a change to `coverage.include` or `coverage.exclude` without a new `// coverage-scope: <why>` comment, and compares against the commit the branch left its base at.
- Lint fails `globalThis.fetch` and its like in the guard and input, and `throw Error("…")` without `new`.
- CI tests Go on 1.26.0 as well as 1.27.3, in a new `go-oldest` job the gate needs.
- Tests run with no git identity of the machine's own, and `expect.poll` waits 30 seconds, from `@internal/vitest-config`.
- New repo checks: `workflows.test.ts`, `go-lint.test.ts`, `go-version.test.ts`, `test-defaults.test.ts`.

What an owner sees differently: the install's `.github/workflows/ci.yml` names each action by commit, with its version in a comment, so `robkit upgrade` shows those lines changed.

### Merged

Added by the lead. PR 113 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `8ae1007`. The lead read the diff and changed nothing.

What the lead checked:

- Each of the seven pinned actions against its upstream tag, with `gh api repos/<owner>/<action>/commits/<tag>`. All seven commits match.
- The time limits against CI's last runs. `check` took 13 to 18 minutes and has 45. `pull-request` took under a minute and has 15.
- `go-oldest` and `pull-request`, the job that runs the new changeset check, both passed on this pull request's own run.

What follows from it:

- A branch cut before this merged has no `check-changesets.ts`, and CI's workflow now calls it. Such a branch merges the milestone's branch in before its `pull-request` job can pass.
- The docs site's `site/vitest.config.ts` is outside the glob `test-defaults.test.ts` reads, so nothing fails there. It can take `testDefaults` when `main` merges into `docs-site`.

Not taken, for a later ticket if R wants it: the changeset check counts every change to a package's `package.json`, so a dev dependency alone needs a changeset naming the package. `.changeset/shared-test-settings.md` names fourteen for that reason, and each one's changelog gets a line that says nothing changes for an app. Counting only the fields that ship would end that.
