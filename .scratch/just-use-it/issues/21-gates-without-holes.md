# 21: Gates without holes

**What to build:** Several lint rules, repo checks and CI steps pass changes they exist to catch ([review](../research/review-2026-11-09.md), "Tooling, CI and publishing"). Each fix comes with the test that shows the hole first. Where the review marks a finding unconfirmed, confirm it before fixing, and record what you found.

- **Lint rules.** The "does no I/O" row also catches `globalThis.fetch` and its like. `no-bare-error` catches `throw Error("…")` without `new`. `no-brand-cast` catches a cast through `never`. `core-schema` catches an aliased `pgSchema`.
- **Changesets.** CI fails when a published package's source changed and no new changeset names that package. `changedFilePatterns` also covers each package's `package.json`, `packages/guard/conformance.json` and `packages/core/drizzle/**`.
- **Coverage.** The threshold check fails a change to `coverage.include` or `coverage.exclude` unless it is excused in the file with a reason, and compares against the merge base.
- **Go formatting.** `lint` fails on an unformatted Go file, in `go/` and in the Go template, with a fixture that proves it.
- **Renovate.** Peer dependency ranges and `engines` aren't pinned, and `renovate.test.ts` says so.
- **Test infrastructure.** A port block is held from the moment it is picked until its suite ends. `install-checks.test.ts` gets installs of its own, or runs after the journeys. The watcher cleans the temp folders the tests make, survives one failed removal, and reads `ps` without overflowing. The fake core's JWK matches real core's shape, and one contract test runs the fake's assumptions about `/refresh` against real core's routes.
- **Workflows.** Every action is named by commit with its version in a comment. `check` and `pull-request` have `timeout-minutes`. CI tests the oldest Go the docs promise as well as the newest, or the docs promise only what CI tests.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Each hole has a test that fails before its fix
- [ ] A pull request that changes `@robkit/core`'s source with a changeset naming only `@robkit/input` fails CI
- [ ] Narrowing a package's coverage `include` without a reason fails the threshold check
- [ ] An unformatted `.go` file fails `pnpm lint` in `go/` and in a Go app
- [ ] Two e2e files started together never get overlapping port blocks
- [ ] Every workflow's actions are pinned by commit, and long jobs have a timeout
- [ ] `tooling/eslint/README.md` and `tooling/repo-checks/README.md` describe each rule and check as it now is
- [ ] The PR's CI `gate` job passes on GitHub
