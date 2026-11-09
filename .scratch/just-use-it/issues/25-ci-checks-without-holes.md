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
