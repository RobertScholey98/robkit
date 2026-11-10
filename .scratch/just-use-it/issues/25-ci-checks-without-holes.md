# 25: CI checks without holes

**What to build:** Several checks pass changes they exist to catch ([review](../research/review-2026-11-09.md), "Tooling, CI and publishing"). Each fix comes with the test that shows the hole first. Where the review marks a finding unconfirmed, confirm it before fixing, and record what you found.

- **Changesets.** CI fails when a published package's source changed and no new changeset names that package. Today one changeset for any package passes. `changedFilePatterns` also covers each package's `package.json`, `packages/guard/conformance.json` and `packages/core/drizzle/**`.
- **Coverage.** The threshold check fails a change to `coverage.include` or `coverage.exclude` unless it is excused in the file with a reason, and compares against the merge base, not the base branch's tip.
- **Go formatting.** `lint` fails on an unformatted Go file, in `go/` and in the Go template, with a fixture that proves it.
- **Two lint rules.** The "does no I/O" row also catches `globalThis.fetch` and its like. `no-bare-error` catches `throw Error("…")` without `new`.
- **Workflows.** Every action in the repo's workflows and in the template's is named by commit, with its version in a comment. `check` and `pull-request` have `timeout-minutes`. CI tests the oldest Go the docs promise as well as the newest, or the docs promise only what CI tests.

**Blocked by:** 14, 22

**Status:** ready-for-agent

- [ ] Each hole has a test that fails before its fix
- [ ] A pull request that changes `@robkit/core`'s source with a changeset naming only `@robkit/input` fails CI
- [ ] Narrowing a package's coverage `include` without a reason fails the threshold check
- [ ] An unformatted `.go` file fails `pnpm lint` in `go/` and in a Go app
- [ ] `globalThis.fetch(…)` in `@robkit/guard` fails lint, and so does `throw Error("fixed text")`
- [ ] Every workflow's actions are pinned by commit, and long jobs have a timeout
- [ ] `tooling/eslint/README.md` and `tooling/repo-checks/README.md` describe each rule and check as it now is
- [ ] The PR's CI `gate` job passes on GitHub

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
