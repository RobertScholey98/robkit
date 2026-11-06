# 13: CI green, and kept green

**What to build:** CI on GitHub passes on the round branch. A coverage threshold can't be raised past what CI measures, and the gates that only exist as prose get checks. Today `pnpm check:all` passes in WSL but fails on CI, on every round-2 commit and on `47-round-1`: test-postgres measures 48.64% branch coverage on CI against a 51% threshold. On `47-round-1` it measured 24% against 28%.

Raises rubric categories 9 (keeping standards up) and 8 (testing). Evidence: `../research/council-r2-opus.md` sections 1, 3, 8 and 9, `../research/council-r2-sonnet.md` sections 8 and 9, `../research/council-r2-sol.md` section 9.

- Find out why test-postgres's coverage differs between CI and WSL. Use `/diagnose`. The CI logs are in `gh run view <id> --log-failed`, and the coverage artifact is uploaded by the `check` job. Make the uncovered branches in `tooling/test-postgres/src/` (likely `clean-up.ts` and `watcher.ts`) covered by tests that take the same path everywhere. Don't lower the threshold to pass.
- Turn `no-unsafe-type-assertion` back on in `tooling/test-postgres` and `tooling/test-session`, and replace their casts with guards or readers.
- A coverage ratchet in `tooling/repo-checks`: fail when a package's measured coverage beats its threshold by more than 2 points, saying which number to raise it to. Run it on CI's coverage, so a threshold set from a WSL or Windows run that CI can't reach also fails there.
- A relative import into another workspace's `src` fails in ESLint, not only in the repo-check test. Add a `folders` entry for every workspace in `tooling/eslint/layers.js`, or generate them from `package-graph.js`, with the same message `graph-check.ts` prints.
- Each CLI wrapper in `tooling/repo-checks/src/` (`check-commit-subjects.ts`, `check-coverage-thresholds.ts`, `check-pr-ticket.ts` and any others) gets a test that runs it as a child process with a good and a bad input, and asserts the exit code and message.
- `.changeset/config.json` treats a change to shipped template code under `packages/create-robkit/templates/` as needing a changeset, excluding template tests.
- CI's job summary shows the e2e run's time.
- Prove it on GitHub: push, and wait for the `gate` job on the PR to pass. `gh pr checks <n>` shows it.

List doc changes under Comments. Ticket 18 owns the docs in this round.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] test-postgres's coverage is the same on CI and in WSL, and its threshold holds on both
- [ ] test-postgres and test-session have no casts, with the cast rule on
- [ ] The coverage ratchet fails on a threshold more than 2 points under CI's measurement
- [ ] ESLint fails a relative import into another workspace
- [ ] Each repo-check CLI has a child-process test for a good and a bad input
- [ ] A template-only change needs a changeset
- [ ] CI's summary shows the e2e time
- [ ] The PR's CI `gate` job passes on GitHub
