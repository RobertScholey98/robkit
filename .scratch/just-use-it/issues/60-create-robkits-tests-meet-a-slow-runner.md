# 60: create-robkit's tests pass on a slow CI runner

**What to build:** create-robkit's unit tests have 30 seconds each. Many of them write a whole install to disk, and the tests in a file run side by side. On CI the first five tests of `check.test.ts`, each of which writes an install, take most of that:

| Run                              | Each of the five | Result                      |
| -------------------------------- | ---------------- | --------------------------- |
| Pull request 131, on `e2e773e`   | 14 to 15 seconds | passed                      |
| Pull request 137, on `25dd5fa`   | 19 to 20 seconds | passed                      |
| Pull request 133, on `c4b207c`   | 27 to 30 seconds | three timed out, two passed |

The third run failed the `check` job of a pull request that changes only the docs site. Nothing in it changed create-robkit. The whole runner was slow. Other packages' tests took 20 to 35 seconds there, and passed under longer limits.

- **Give the tests a limit a slow runner meets.** A limit costs a passing test nothing, so it can be several times what CI usually takes.

**Blocked by:** none

**Status:** done

- [x] The failure is reproduced before the fix, shown by the same "Test timed out" with a limit shorter than an install takes to write
- [x] create-robkit's unit tests have the limit the other packages' slow tests have
- [x] `check.test.ts` and `generate.test.ts` still pass
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- The limit is two minutes, which `@robkit/core`, `@robkit/dev`, `@robkit/drizzle` and `@robkit/provision` already give their tests that start Postgres. It is four times the slowest run seen.
- I reproduced it in WSL with `--testTimeout=300`. 43 of the 44 tests in `check.test.ts` failed with "Test timed out in 300ms", as three did in CI at 30 seconds. With the limit as configured, each of the five takes about 1.1 seconds there.
- The tests still write a whole install each. Sharing one would make them faster, but most of them change a file in theirs, and a test that passes in 20 seconds on CI needs room more than it needs a rewrite.
- The `pack` tests keep their own limit of five minutes.
- No changeset. The config file isn't part of what create-robkit publishes.

### Merged

Added by the lead. PR 139 merged into `main` on 2026-11-11 as `26491fd5`, with `gate` green on `6b6d819`. Its first `check` failed on the port test that [ticket 61](61-port-tests-lease-their-ports.md) fixes, and passed when run again.
