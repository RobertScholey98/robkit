# 20: The dev runner's tests pass under load

**What to build:** Find why `packages/dev/src/runner.db.test.ts` fails now and then, mostly "stops everything and fails when an app exits", and fix the cause in the test or the runner, whichever is wrong. No retries, and no longer timeouts unless a timeout is the cause.

It failed on GitHub CI on PR #60's run 42173250330, attempt 2, and now and then since round 2 on several branches. In WSL under load it failed twice in round 2, a different test each time. Run alone, it passes.

**Status:** needs-triage

- [ ] The failure reproduced before the fix, with how often
- [ ] The cause found and fixed, with a test that fails without the fix
- [ ] The same load passes after the fix, over enough runs to trust
- [ ] The PR's CI `gate` job passes on GitHub
