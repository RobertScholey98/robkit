# 71: Core's password tests pass on a slow CI runner

**What to build:** `packages/core/src/password.test.ts` runs scrypt at its real cost, 32 MiB a call, up to four times in a test. Core's unit tests have vitest's default five seconds each. On CI the two tests that make four calls take most of that:

| Run                            | The whole file | "salts each hash" | "accepts the password" | Result    |
| ------------------------------ | -------------- | ----------------- | ---------------------- | --------- |
| Pull request 153, on `3fc4eb1` | 12.6 seconds   | 2.1 seconds       | 2.9 seconds            | passed    |
| Pull request 152, on `4e4174f` | 17.4 seconds   | 3.7 seconds       | 3.5 seconds            | passed    |
| Pull request 151, on `892d4fb` | 19.7 seconds   | 4.6 seconds       | 3.5 seconds            | passed    |
| Pull request 154, on `94cbde6` | 22.0 seconds   | 4.3 seconds       | 5.07 seconds           | timed out |

The fourth run failed the `check` job of a pull request that adds five ticket files and changes no code. The test did nothing wrong. It was one scrypt call from done when its time ran out.

- **Give core's unit tests a limit a slow runner meets.** A limit costs a passing test nothing, so it can be several times what CI has taken.

**Blocked by:** none

**Status:** done

- [x] The failure is reproduced before the fix, shown by the same "Test timed out" with a limit shorter than scrypt takes
- [x] Core's unit tests have a limit several times the slowest run seen
- [x] `password.test.ts` and the rest of core's unit tests still pass
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, 2026-11-11

- The limit is 30 seconds, for core's `unit` project alone. That is six times the slowest run seen. The `db` project keeps its two minutes.
- I set it in `vitest.config.ts`, as create-robkit's and repo-checks' limits are set, with the reason beside it. `password.test.ts` is the only unit test in core that runs scrypt.
- I reproduced it in WSL with `--testTimeout=300`. Two of the file's 14 tests failed with "Test timed out in 300ms", the two that hold the most scrypt calls at once. The test CI failed took 276 milliseconds there, against 5.07 seconds on the runner.
- The tests still run scrypt at its real cost. They check the stored hash's real parameters, so a cheaper scrypt would test something else.

### Proof

- In WSL (Ubuntu 22.04, Node 24) with the limit as configured, `password.test.ts` passes all 14 in 1.6 seconds, and core's unit tests pass all 191 with coverage. Core's typecheck and lint pass.
- The four CI runs' times are in the table above, read from each run's log.

### Merged

Pull request 155 merged to `main` as `8ae537af` on 2026-11-11. Its `gate` job passed on `57c30c8`.
