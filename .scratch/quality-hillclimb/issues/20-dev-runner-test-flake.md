# 20: The dev runner's tests pass under load

**What to build:** Find why `packages/dev/src/runner.db.test.ts` fails now and then, mostly "stops everything and fails when an app exits", and fix the cause in the test or the runner, whichever is wrong. No retries, and no longer timeouts unless a timeout is the cause.

It failed on GitHub CI on PR #60's run 42173250330, attempt 2, and now and then since round 2 on several branches. In WSL under load it failed twice in round 2, a different test each time. Run alone, it passes.

**Status:** done

- [x] The failure reproduced before the fix, with how often
- [x] The cause found and fixed, with a test that fails without the fix
- [x] The same load passes after the fix, over enough runs to trust
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**The cause.** The test was wrong, not the runner. In the crash test, the fixture's beta app exited 1 second after it started. Both apps start together, but on a busy machine alpha's `pnpm run dev` can start more than a second after beta's. Then robkit-dev correctly stops alpha before alpha writes its `started` marker, and the test fails with `expected [ 'beta' ] to deeply equal [ 'alpha', 'beta' ]`. All three CI failures of this file I found have that error: runs 42164970841, 42170462311 and 42173250330.

**The fix.** The fixture app writes a `listening` marker once it listens. The crashing app now exits only once every app has one, so there's no timer to race. The crash test also slows alpha's start by 2 seconds (`FIXTURE_SLOW_START`), which fails every run against the old timer. 2 seconds is twice the old timer's delay, and it adds 2 seconds to one test.

**Proof.** All runs were in WSL (16 CPUs, Docker Desktop). "Load" means 32 busy loops plus 3 copies of the file running at once.

- Red, made certain: with alpha slowed and the old timer, the crash test failed 3 of 3 runs with CI's error.
- Red, natural: on the base code under load, the crash test failed 2 of 30 runs with CI's error. I narrowed beta's timer from 1000ms to 250ms to widen the window, and didn't delay alpha. With the real 1000ms timer the base passed 12 of 12, so the race is real but rare. Start times from leftover test installs showed alpha starting up to 1.4s after beta.
- Green, same load: the fixed crash test passed 60 of 60 runs, each with alpha 2 seconds late, and the whole file passed 24 of 24.
- CI: the `gate` job passed on https://github.com/RobertScholey98/robkit/actions/runs/42180040513.

**What I couldn't fix here.** The "different test each time" WSL failures from round 2 may have a second cause. Under much heavier load (48 busy loops on 16 CPUs, 4 copies of the file, plus core's and session's suites), 6 of 8 base runs failed because Postgres's healthcheck marked the container unhealthy, so `docker compose up --wait` failed. The probable mechanism: once one check has passed, Docker counts every failure, and three 5-second `pg_isready` timeouts in a row mark the container unhealthy. I didn't confirm it from Docker's health log. The healthcheck is the install template's (`packages/create-robkit/templates/base/compose.yaml`), CI has never shown this failure, and the brief rules out longer timeouts without proof. So I left it alone. Another session's WSL gate was running during that run too.

**Edits to files other tickets own:** none.
