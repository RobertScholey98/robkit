# 06: The fast gate runs everything that can run, reliably

**What to build:** `pnpm check` passes on a cold run on Windows, with nothing cached, and runs every test that needs no Docker, including core's and dev's. All three round-1 reviewers hit create-robkit tests timing out at 30 seconds under the gate's load, and found that core and dev contribute no tests to `pnpm check` because their whole suites sit behind a Postgres global setup.

Raises rubric categories 8 (testing), 10 (nice to work in) and 6 (consistency). Evidence: `../research/council-r1-opus.md` sections 8 and 10, `../research/council-r1-sol.md` sections 8 and 10, `../research/council-r1-sonnet.md` sections 6, 8 and 10.

- Core and dev: name Postgres-backed test files `*.db.test.ts` (or another clear convention), run the global setup only for those, and give both packages a `test:unit` that runs the rest. Pure modules such as core's `env`, `client`, `access-codes`, `password` and `rate-limit` and dev's `env` and `cli` then run in `pnpm check`. Add a unit test for `packages/core/src/rate-limit.ts`, which has none of its own.
- create-robkit's tests: find what makes them slow under load (each generates an install and formats it with Prettier) and fix the cause. Share one generated install per file where a test only reads it; keep tests that write or add on their own install. Don't raise timeouts to hide it. If a concurrency cap in `turbo.json` or Vitest is also needed, measure before and after.
- Test `packages/create-robkit/src/coolify.ts`'s planning and deploy waves through `deploy` with a fake Coolify `fetch`, and raise create-robkit's coverage thresholds to the new numbers.
- A repo check that every workspace package with a `test` script defines `build` (published packages), `lint`, `typecheck`, `test` and `test:unit`, unless it is listed as needing Docker for all its tests, with the reason.
- Measure `pnpm check` cold (`--force`) and warm on Windows, three runs each, and put the measured times in `CONTRIBUTING.md`'s "Check your work" table. This ticket owns that table; ticket 07 owns the rest of CONTRIBUTING.

**Blocked by:** none

**Status:** done

- [x] core and dev have `test:unit`, and their pure tests run in `pnpm check`
- [x] rate-limit has its own unit test
- [x] Three cold `pnpm check --force` runs on Windows pass with no timeout, and the time is measured
- [x] Coolify's planning and waves are tested through `deploy`, and create-robkit's thresholds rise
- [x] A repo check enforces the scripts each package defines
- [x] CONTRIBUTING's gate table gives the measured times
- [ ] The full gate passes: `pnpm check:all`

## Comments

**What I chose**

- Core's and dev's Postgres-backed test files are `*.db.test.ts`. Each package's `vitest.config.ts` has two projects: `unit` (every other test file, no global setup) and `db` (the `*.db.test.ts` files, with the Postgres global setup and the 120-second timeouts). `test` runs both with coverage; `test:unit` is `vitest run --project unit`, without coverage, since the thresholds count the db tests. dev's `runner.db.test.ts` starts Postgres through Compose rather than the global setup, but it needs Docker, so it takes the suffix too.
- The fast gate now runs core's `access-codes`, `client`, `env`, `password` and `rate-limit` tests (33 tests) and dev's `apps`, `cli`, `env` and `proxy` tests (35).
- create-robkit's slowness wasn't generating installs: one generates and writes in 200 to 300 ms, and Prettier formats only two small files. Run one file at a time, the suite took about 57 seconds, and most of it was child processes: `vendor.test.ts` 28 s (14 pnpm processes running `tsc` builds and packs one after another), `robkit.test.ts` 14 s (a CLI spawn per test, each loading TypeScript), `check.test.ts` 6 s, `bin.test.ts` 5 s. Under the gate, all of that competes with lint and typecheck. The fixes:
  - `robkit` loads `check.ts`, and with it TypeScript, only for `robkit check`. A `robkit add` spawn went from about 620 ms to 360 ms.
  - Tests that only read an install share one per file (add, check, deployment, robkit): 16 fewer installs.
  - `vendorPackages` builds every linked package with one `pnpm --recursive` and packs them with another. Since the names now go into one command line, it refuses an override whose name isn't a package name. The vendor test went from 43 s to 14 to 22 s inside the gate.
  - The per-describe `{ timeout: 30_000 }` literals repeated the config's `testTimeout`, so I removed them. No timeout went up.
- I found and fixed a flake on the way: under coverage, `coolify.test.ts`'s two hung-request tests waited out 30 s in 3 of 3 runs. The fake Coolify listened on its own `Request`'s signal, which follows the caller's only weakly, so garbage collection could take it before it aborted. It now listens on the caller's signal: 5 of 5 passes. Real `fetch` holds the request while it's in flight, so `coolify.ts` itself is fine.
- No concurrency cap in `turbo.json` or Vitest. With the fixes, three cold runs passed, and the slowest test (vendor) took 14 to 22 s against the 30 s limit; the slowest other test (bin's "asks init's questions", which drives init twice and compares both installs) took 8 to 15 s.
- The scripts check (`tooling/repo-checks/src/package-scripts.ts`) has three listed exceptions: e2e and test-postgres have no `test:unit` because every test needs Docker, and `@internal/eslint-config` has no `typecheck` because it is plain JavaScript. That last one goes beyond the ticket's Docker-only exception; giving the ESLint config a `tsc --checkJs` typecheck would remove it.

**Proof**

- `pnpm check --force` on Windows (16 threads), three runs: 53, 61 and 65 s, all passed, 44 of 44 tasks. Warm `pnpm check`: 25, 30 and 34 s, 43 of 44 tasks cached (repo-checks' `test:unit` reads the whole tree, so it misses). Before the create-robkit fixes, one cold run on this branch took 75 s, and create-robkit's suite took 45 s of it.
- Full suites in WSL with Postgres, thresholds held: core 21 files, 237 tests; dev 6 files, 55 tests; create-robkit 18 files, 182 tests; repo-checks 9 files, 72 tests.
- `rate-limit.test.ts` fails on mutants: `Math.floor` for `Math.ceil`, a window that never expires, and an off-by-one limit.
- The scripts check fails against the base's core and dev manifests, and passes now.
- create-robkit coverage: 72.47 / 65.01 / 78.84 / 73 (statements, branches, functions, lines) on Windows, and 64.83% branches on Linux, where some branches don't run. Thresholds rose from 64/51/74/65 to 72/64/78/73, Linux's numbers, since CI runs there. coolify.ts branches went from 71% to 89%. Repo-checks' thresholds rose from 65/58/72/66 to 82/73/87/84.

**Not verified**

- `pnpm check:all` is left to the coordinator, as the brief says.
- Other agents were running on this machine throughout, so the times vary with their load.
- dev's `runner.db.test.ts` failed twice in WSL under load (an app counted as not started; once a 60 s timeout), each time a different test. Run alone it passed 6 of 6 on this branch and 7 of 7 on `47-round-1`. Its code is unchanged here apart from the rename, so I took it as load-sensitive and left it. It may be worth its own ticket.

**Doc changes for their owner (07)**

- CONTRIBUTING's "Run one package's tests": core and dev now also run in `pnpm check`; only their `*.db.test.ts` files need Docker and Linux.
- AGENTS.md's conventions: name a test file that needs Postgres `*.db.test.ts`; core and dev run them in a `db` Vitest project. The existing line "A package whose tests need no Docker defines `test:unit`" could add that `package-scripts.ts` enforces it, with its exceptions.
- `docs/conventions/errors.md` (10): nothing to change.
