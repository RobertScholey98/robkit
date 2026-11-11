# 39: A test's app starts before its limit stops it

**What to build:** `requests.db.test.ts` in `@robkit/dev` has a test, "stops an added app that doesn't answer within the limit, and says to check its port". It adds an app whose script writes its pid to a file on its first line and then listens nowhere. It gives `pnpm dev` six seconds to wait for the app, then reads the pid and checks that process is gone.

On a busy CI runner, pnpm took longer than six seconds to reach the script's first line. `pnpm dev` stopped the app before the file was written, and the test failed with `ENOENT` on the file. It failed the `check` job of pull request 124 twice in a row, on a branch that changes only the docs site.

- **Give the app time to start.** The limit is long enough for pnpm to reach the script's first line on a busy runner.

**Blocked by:** none

**Status:** done

- [x] The failure is reproduced before the fix, shown by the same `ENOENT` with a limit shorter than the script's start
- [x] The test passes with the new limit, and the test file's other tests still pass
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- The limit is fifteen seconds, the one the test "gives a new core that never answers a limit" already uses for an app that must answer. That test passed in both runs where this one failed, so fifteen seconds was enough on the same runner under the same load.
- The test waits out its whole limit, so it takes nine seconds longer.
- I reproduced it in WSL with the limit at 300 ms. The test failed with `ENOENT` on `apps/aardvark/started`, at the same line as in CI.
- A longer limit narrows the race and doesn't remove it. Removing it needs the test to learn the app's pid without the app's own code running, such as from `pnpm dev`. That is more than this test is worth today.
