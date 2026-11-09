# 26: Tests that don't collide

**What to build:** The test infrastructure has four ways to fail a run that changed nothing, and one way to pass a guard that real core would refuse ([review](../research/review-2026-11-09.md), "Tooling, CI and publishing"). A gate people re-run until it passes stops being a gate.

- **A port block belongs to one suite.** `freePortBlock` probes a block of ports and lets it go, and the suite's servers bind much later, so two suites can pick the same block. Give each block a lease that every test worker on the machine respects, held until the suite ends: a lock file or folder named for the block's first port, taken atomically and removed at the end, with the watcher clearing one a killed run left. The probe sockets still close before the servers start, since the servers must bind those ports. A collision with something outside the tests gets a bounded retry on a fresh block.
- **`install-checks.test.ts` gets its own installs.** It builds and writes files in installs that other test files are running `pnpm dev` in. It makes its own, or runs after the journeys. Its run of the install's own CI steps also leaves out the deploy job, so an exported `COOLIFY_URL` can't make it fail.
- **The watcher cleans what the tests make.** Temp folders the tests create (`robkit-bin-*`, `robkit-caddy-*`, whole installs) are leftovers it removes. One failed removal doesn't stop the rest, and it reads the process list without overflowing its buffer.
- **The Next journey that times out.** `next.test.ts`'s "sends a server action from a signed-out page to the hub to sign in, and back" timed out in CI on a pull request that changed only markdown ([run 42691533886](https://github.com/RobertScholey98/robkit/actions/runs/42691533886)). Reproduce it, find the cause, and fix the test or the code. Don't add a retry.
- **The fake core matches the real one.** Its JWK has the shape core's has, `use` included. One contract test runs what the fake assumes about `/refresh` and the callback against real core's routes, so a guard that sends a `next` core would refuse can't pass every unit test.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Two suites that ask for a port block at the same time never get overlapping ones, with a test that asks from two processes
- [ ] A lease left by a killed run is cleared, and doesn't stop the next run
- [ ] `install-checks.test.ts` changes no file in an install another test file is using
- [ ] After a killed e2e run, the watcher has removed the run's temp folders as well as its containers
- [ ] The Next server-action journey passes 20 runs in a row in CI's conditions, with the cause recorded in the comments
- [ ] The contract test fails if core's `/refresh` and the fake's stand-in disagree about a `next`
- [ ] `docs/testing.md` describes the lease and the watcher as they now are
- [ ] The PR's CI `gate` job passes on GitHub
