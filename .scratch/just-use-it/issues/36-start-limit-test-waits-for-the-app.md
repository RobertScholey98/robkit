# 36: The start-limit test waits until the app has started

**What to build:** `packages/dev/src/requests.db.test.ts` has a test named "stops an added app that doesn't answer within the limit, and says to check its port". It gives `pnpm dev` a start limit of 6 seconds and adds an app whose `dev` script runs `node -e`, which writes its pid to `started` and listens nowhere. After `pnpm dev` refuses the app, the test reads `started` to check the process is gone.

On a loaded CI runner, the app's `pnpm run dev` and `node` don't always get as far as writing `started` within 6 seconds. `pnpm dev` stops the app first, and the test fails with:

```text
Error: ENOENT: no such file or directory, open '/tmp/robkit-dev-2Nx6i7/apps/aardvark/started'
 ❯ src/requests.db.test.ts:283:22
```

It failed this way on both attempts of the `check` job for the docs site's PR 124, run 42973439606. That PR changes only the docs site, and PRs 125 and 126, which hold all of its commits, passed the same job.

- **The test checks the process it started, however slowly it started.** For example, it waits for `started` before the limit can run out. Or it gives the limit enough time to cover the app's start, and still holds the message to "within 0.1 minutes".
- **What `pnpm dev` does is unchanged.**

**Blocked by:** none

**Status:** needs-triage

- [ ] The test passes on a runner where the app takes longer than the limit to write `started`
- [ ] It still fails if `pnpm dev` leaves the app's process running
- [ ] The PR's CI `gate` job passes on GitHub
