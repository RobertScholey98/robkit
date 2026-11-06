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

**Status:** done

- [x] test-postgres's coverage is the same on CI and in WSL, and its threshold holds on both
- [x] test-postgres and test-session have no casts, with the cast rule on
- [x] The coverage ratchet fails on a threshold more than 2 points under CI's measurement
- [x] ESLint fails a relative import into another workspace
- [x] Each repo-check CLI has a child-process test for a good and a bad input
- [x] A template-only change needs a changeset
- [x] CI's summary shows the e2e time
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Why CI and WSL measured test-postgres differently

CI sets `COMPOSE_FILE` (for `host-network.yaml`) and WSL doesn't. `testComposeFiles` falls back to `"compose.yaml"` with `??`, so that branch ran only in WSL: 19 of 37 branches there, 18 of 37 on CI, 51.35% against 48.64%. Running WSL with `COMPOSE_FILE=compose.yaml` reproduced CI's 48.64% and its threshold failure exactly. A test now gives `testComposeFiles` each env itself. That one commit made CI green on its own (run 42155669884).

### What I chose

- **The watcher's coverage.** `watcher.ts` runs detached, so coverage never saw it and it counted 0% everywhere. Its work moved to `remove.ts`, which tests run in-process: each kind of Docker leftover, a prefix that names nothing, and tagged processes that stop on SIGTERM or need SIGKILL. `removeLeftover` takes the grace before SIGKILL (15 seconds by default) so that test takes half a second. test-postgres now measures 89.28 / 90.24 / 96.66 / 89.58 on CI and in WSL, whether or not `COMPOSE_FILE` is set, and its thresholds are 89 / 90 / 96 / 89.
- **Casts.** The rule is on for both packages' source; tests stay exempt, as everywhere in the repo. test-session's fake core reads its port with `listeningPort`, the conformance viewer's code id comes from `readCodeId`, and `refreshLocation` returns its Vitest matcher as `unknown` (Vitest types it `any`), so `PageAnswer.location` is `unknown` too. The two guard throws live in `src/known.ts`, with tests, because test-session's thresholds are 100%. test-postgres's `alive()` checks the error's code with a guard. I also dropped the one cast in test-postgres's tests. test-session's tests still cast `"family"` to `RoleId`, the JWKS body and a stream chunk. Ticket 19 adds brand builders to test-session and removes brand casts from tests, so I left those to it.
- **Coverage ratchet.** `check-coverage-ratchet.ts` reads each package's `coverage/coverage-final.json`, totals it as Vitest does (Istanbul's percentages, rounded down to two places; a line counts when any statement starting on it ran), and fails on a threshold more than 2 points under, naming the number to set: the measurement rounded down. It also fails a package with thresholds but no report. CI runs it after `pnpm check:all`. On its first run it failed test-postgres and repo-checks with the numbers to raise them to, which I then set.
- **repo-checks' CLI scripts are out of coverage.** Their tests run them as child processes, which coverage can't see, so each new script lowered repo-checks' coverage however well it was tested. CI caught this. `vitest.config.ts` now leaves out `src/check-*.ts` and `src/print-*.ts`, and `cli-tests.test.ts` fails on a script (any file that calls `process.exit`) without a test that spawns it by name, or with a name the exclusion misses.
- **Relative imports in ESLint.** I didn't add a `folders` row per workspace: `layerForbids` reads rows' folders as forbidden edges, so those rows would forbid every edge the graph allows. The layer rule instead reports any relative import that leaves its workspace and that no row already caught, for every workspace under `packages/` and `tooling/`. A relative import into core keeps its core-row message. Both ESLint and `graph-check.ts` take the text from `reachesOutside()` in `layers.js`. ESLint's says "Layer rule: this import reaches outside packages/guard with ../../session/src/input.ts. Import the package by name."
- **CLI tests.** `check-commit-subjects`, `check-coverage-thresholds` and `check-pr-ticket` already had child-process tests with good and bad input. I added their usage errors (exit 2), and child-process tests for the two new scripts.
- **Changesets.** `changedFilePatterns` adds `templates/**`, leaving out `templates/**/*.test.ts` and `*.test.tsx`. `changeset-config.test.ts` runs `changeset status --since=main` on a scratch repo with the real config. turbo.json adds the config to repo-checks' test inputs, so changing it reruns the test.
- **Test times.** CI sets `TURBO_RUN_SUMMARY=true`, and `print-test-times.ts` turns turbo's run summary into a table of every test task, slowest first. CI writes it to the job summary and the log. I listed every test task, not only e2e, because the next slowest are useful to see too.
- **A timeout.** One CI run failed `suppressions.test.js` at Vitest's 5-second limit (5.9 s). Its first lint builds a TypeScript program; alone it takes about a second. The ESLint package's tests now get 30 seconds each, as repo-checks' already did.

### Proof

- Final CI run, all three jobs green, `gate` included: https://github.com/RobertScholey98/robkit/actions/runs/42158416018 (head 80e9324). `pnpm check:all` passed there with the whole-stack test. The summary's table starts `| @internal/e2e#test | 4m 11s |`.
- Ratchet on CI: run 42157603029 failed with lines such as `tooling/test-postgres/vitest.config.ts sets the branches threshold to 51, but its tests cover 90.24%. Raise it to 90.`
- Tests that went red first: the four new layer-rule cases before the rule change; the changeset test's two template cases against the old config; the ratchet and coverage-total tests against two mutations; `cli-tests.test.ts` with one test's script name hidden.
- `pnpm check` on Windows: 44 of 44 tasks passed. test-postgres in WSL: 21 tests passed, same coverage as CI.

### Not verified

- `pnpm check:all` in WSL as a whole. CI ran it, and I ran test-postgres's tests in WSL.
- test-postgres's `alive(1)` test takes the EPERM path only as a user who can't signal pid 1. The CI runner and WSL both run as such a user. As root it still passes, but by the other path.

### For ticket 18 (docs)

I made small edits; ticket 18 may reword them:

- `AGENTS.md`: thresholds are set to what CI measures, and the ratchet; changesets cover create-robkit's `templates`; a new line that a relative import never leaves its workspace.
- `CONTRIBUTING.md`: the same two points, and that the `check` job's `coverage` artifact has CI's reports.
- `docs/testing.md`: CI's job summary lists the whole-stack test's time.
- Worth adding to `tooling/repo-checks/README.md`: `check-coverage-ratchet.ts`, `print-test-times.ts`, `cli-tests.test.ts` and `changeset-config.test.ts`. For `tooling/eslint/README.md`: the layer rule's message for a relative import out of its workspace.

### For ticket 19

- `@internal/test-session` now has `src/known.ts` (`known`, `listeningPort`), for internal use. The brand builders could use `known` with `readCodeId` and `readRoleId`.
