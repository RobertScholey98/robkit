# 06: The fast gate runs everything that can run, reliably

**What to build:** `pnpm check` passes on a cold run on Windows, with nothing cached, and runs every test that needs no Docker, including core's and dev's. All three round-1 reviewers hit create-robkit tests timing out at 30 seconds under the gate's load, and found that core and dev contribute no tests to `pnpm check` because their whole suites sit behind a Postgres global setup.

Raises rubric categories 8 (testing), 10 (nice to work in) and 6 (consistency). Evidence: `../research/council-r1-opus.md` sections 8 and 10, `../research/council-r1-sol.md` sections 8 and 10, `../research/council-r1-sonnet.md` sections 6, 8 and 10.

- Core and dev: name Postgres-backed test files `*.db.test.ts` (or another clear convention), run the global setup only for those, and give both packages a `test:unit` that runs the rest. Pure modules such as core's `env`, `client`, `access-codes`, `password` and `rate-limit` and dev's `env` and `cli` then run in `pnpm check`. Add a unit test for `packages/core/src/rate-limit.ts`, which has none of its own.
- create-robkit's tests: find what makes them slow under load (each generates an install and formats it with Prettier) and fix the cause. Share one generated install per file where a test only reads it; keep tests that write or add on their own install. Don't raise timeouts to hide it. If a concurrency cap in `turbo.json` or Vitest is also needed, measure before and after.
- Test `packages/create-robkit/src/coolify.ts`'s planning and deploy waves through `deploy` with a fake Coolify `fetch`, and raise create-robkit's coverage thresholds to the new numbers.
- A repo check that every workspace package with a `test` script defines `build` (published packages), `lint`, `typecheck`, `test` and `test:unit`, unless it is listed as needing Docker for all its tests, with the reason.
- Measure `pnpm check` cold (`--force`) and warm on Windows, three runs each, and put the measured times in `CONTRIBUTING.md`'s "Check your work" table. This ticket owns that table; ticket 07 owns the rest of CONTRIBUTING.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] core and dev have `test:unit`, and their pure tests run in `pnpm check`
- [ ] rate-limit has its own unit test
- [ ] Three cold `pnpm check --force` runs on Windows pass with no timeout, and the time is measured
- [ ] Coolify's planning and waves are tested through `deploy`, and create-robkit's thresholds rise
- [ ] A repo check enforces the scripts each package defines
- [ ] CONTRIBUTING's gate table gives the measured times
- [ ] The full gate passes: `pnpm check:all`
