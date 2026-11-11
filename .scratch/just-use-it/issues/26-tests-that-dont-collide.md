# 26: Tests that don't collide

**What to build:** The test infrastructure has four ways to fail a run that changed nothing ([review](../research/review-2026-11-09.md), "Tooling, CI and publishing"). A gate people re-run until it passes stops being a gate.

- **A port block belongs to one suite.** `freePortBlock` probes a block of ports and lets it go, and the suite's servers bind much later, so two suites can pick the same block. Give each block a lease that every test worker on the machine respects, held until the suite ends: a lock file or folder named for the block's first port, taken atomically and removed at the end, with the watcher clearing one a killed run left. The probe sockets still close before the servers start, since the servers must bind those ports. A collision with something outside the tests gets a bounded retry on a fresh block.
- **`install-checks.test.ts` gets its own installs.** It builds and writes files in installs that other test files are running `pnpm dev` in. It makes its own, or runs after the journeys. Its run of the install's own CI steps also leaves out the deploy job, so an exported `COOLIFY_URL` can't make it fail.
- **The watcher cleans what the tests make.** Temp folders the tests create (`robkit-bin-*`, `robkit-caddy-*`, whole installs) are leftovers it removes. One failed removal doesn't stop the rest, and it reads the process list without overflowing its buffer.
- **The Next journey that times out.** `next.test.ts`'s "sends a server action from a signed-out page to the hub to sign in, and back" timed out in CI on a pull request that changed only markdown ([run 42691533886](https://github.com/RobertScholey98/robkit/actions/runs/42691533886)). Reproduce it, find the cause, and fix the test or the code. Don't add a retry.

**Blocked by:** none

**Status:** done

- [x] Two suites that ask for a port block at the same time never get overlapping ones, with a test that asks from two processes
- [x] A lease left by a killed run is cleared, and doesn't stop the next run
- [x] `install-checks.test.ts` changes no file in an install another test file is using
- [x] After a killed e2e run, the watcher has removed the run's temp folders as well as its containers
- [x] The cause of the Next server-action journey's timeout is found and recorded in the comments, a regression test covers that cause, and a bounded stress run passed afterwards (the comments say what ran and how many times). No retry, and no longer timeout
- [x] `docs/testing.md` describes the lease and the watcher as they now are
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### Changes the lead made on 2026-11-09

- **The fake core stays as it is.** The bullet "The fake core matches the real one" and its contract-test criterion moved to a later ticket, after milestone 1's guard changes.
- **The Next journey: prove the cause, not a streak.** "Passes 20 runs in a row" became: the cause is found and recorded, a regression test covers it, and a bounded stress run passed afterwards.

### The Next journey's cause

Playwright's `networkidle` can be taken back and never fire again. Every timeout in CI was `page.waitForLoadState("networkidle")` after sign-in, and every one had the same order of events:

1. The example's document and first chunks load, and `domcontentloaded` fires.
2. The page makes no request for more than 500 ms while it runs Next's dev chunks, so Playwright fires `networkidle`. The gaps were 552, 660 and 745 ms.
3. Next loads one more hmr-client chunk. It starts and finishes before `load`.
4. `load` fires. Playwright 1.64.1 recalculates the frame's idle state, finds the "quiet for 500 ms" flag that the late chunk cleared, and removes `networkidle`. The 500 ms timer can't restart, because it refuses to start while `networkidle` was fired, and nothing else asks for a new one once the page is quiet. The wait runs out after 30 s.

How I found it: I traced every request, frame and lifecycle event into the journey's browser log in CI. Three of 20 stressed journeys failed (run 42707989161). None had a request still loading at close, a child frame, or a request after `load`. Then I read the code in Playwright's `coreBundle.js` (`_onClearLifecycle`, `_startNetworkIdleTimer`, `_recalculateNetworkIdle`).

It never failed in WSL, where the machine is fast enough that the chunks don't leave a 500 ms gap. A plain page with the same order of events reproduces it every time: 6 of 6 runs on Windows.

The fix: `networkIdle(page)` in `tooling/e2e/src/browser.ts` counts each page's requests itself and resolves after 500 ms with none in flight. It times out after 30 s, like Playwright's wait, and names what is still loading. Both waits that used `networkidle` use it now: the Next lapsed-call journeys and the server-function journey. Lint bans the `"networkidle"` string in `tooling/e2e`.

The regression test is in `browser.test.ts`. One test pins Playwright's behaviour on that page, so it fails once Playwright fixes it and `networkIdle` can go. The next one checks that `networkIdle` resolves on the same page.

Stress after the fix: a temporary commit ran each Next lapsed-call journey 10 more times in `next.test.ts`, so 11 client navigations and 10 server actions. All 21 passed in CI ([run 42711930226](https://github.com/RobertScholey98/robkit/actions/runs/42711930226), attempt 2, on 7933bc6). The same loop failed 2 and then 3 of 20 before the fix. The commit is dropped from the branch.

### What I chose, and why

Chosen in the build, awaiting R's review.

- **A lease is a symlink**, named for the block's first port and pointing at the holder's pid, in `<tmpdir>/robkit-port-leases`. Making a symlink is atomic, it needs no file content to read back, and `readlink` tells the watcher whose it is.
- **Blocks sit on a grid of 20 ports from 20000** (500 blocks). Two blocks overlap only if they share a first port, so one lease covers a block. The largest ask today is well under 20 ports; asking for more throws.
- **A lease stays until its process exits**, not until a suite ends. A test process runs one suite, and the watcher it already has releases every lease the pid holds. A block whose probe fails keeps its lease too, so no one tries it again in that run.
- **50 tries**, each on a random block, then an error naming the port range and the leases folder.
- **`freePortBlock` takes `leases` and `pick` options** so its tests can use their own folder and choose blocks without racing the real suites.
- **`releaseLeases` skips any entry it can't read as a link**, such as a stray file, rather than failing the watcher.
- **install-checks makes a second set of installs** in the same global setup, built in parallel with the journeys' set, rather than running after the journeys. A test checks that the two sets share no folder.
- **An install's own CI run skips every job with an `if`**, not only the job named `deploy`. The deploy job is the only one with an `if` today, and any job with one depends on something the test doesn't set.
- **test-postgres's coverage thresholds** went up to what CI measures (92, 92, 97, 92). The first CI run failed because the new lease code ran only in child processes, where coverage doesn't count, so I added tests that run it in the test process.

### Proof

- Red first:
  - The two-process overlap test, run with leasing switched off, gave 3,860 distinct ports out of 4,800.
  - The process-list test failed with `spawnSync ps ENOBUFS` before `maxBuffer`.
  - The `networkIdle` tests failed before `networkIdle` existed. The Playwright pin passed on the same page.
- `browser.test.ts` on Windows: 5 of 5, four runs in a row.
- `pnpm check` on Windows: 59 of 59 tasks.
- WSL, `pnpm check:all` on the branch merged with `m1-the-subdomain-boundary` (8aad9b2): 61 of 61 tasks in 6 minutes 57 seconds. No `sleep` processes were left afterwards.
- GitHub's `gate` on the pushed head is the judge. The PR says how it went.

### Not verified

- A Playwright upstream issue for this. I searched and found none that matches; I didn't file one.
- The fix under the exact CI load beyond the stress run above.
- Killing a real e2e run by hand and then looking at the temp folders. The clean-up test kills a test process that registered a folder and checks the folder is gone.

### For other tickets

- **Leftover `sleep 600` processes in WSL.** `remove.test.ts` killed the `sh` it started and left its `sleep` behind. Each carried the test process's environment, about 100 kB. With 36 of them running, `ps axeww` printed 2.7 MB, which overflowed `execFileSync`'s 1 MB buffer. The tests now stop everything with their tag, and the padded processes run `sleep` directly with a tag of their own. I killed the 36 that were mine.
- **Temp folders on Windows.** Most aren't made in this ticket's area, so I didn't widen it. About 70 `mkdtemp` calls make them, with no shared helper. Counted in `%LOCALAPPDATA%\Temp` on 2026-11-09:
  - `robkit-*` (15,064): create-robkit's add, create-robkit-command, deployment, init, robkit-command, set-up and write tests, and dev's `exec.test.ts`.
  - `robkit-check-*` (5,040): create-robkit's `check.test.ts`.
  - `robkit-vendor-*` (1,083) and `robkit-checkout-*` (380): create-robkit's vendor tests.
  - `robkit-add-wizard-*` (736) and `robkit-wizard-*` (124): create-robkit's wizard tests.
  - `robkit-apps-*` (673) and `robkit-dev-*` (18): dev's tests.
  - `robkit-api-*` (208), `robkit-stack-journeys-*` (14), `robkit-pack-*` (18) and `robkit-new-package-*`: repo-checks.
  - `robkit-install-checks-*` and `robkit-install-lint-*`: create-robkit; install-checks removes its own with a detached `removeLater`.
  - `robkit-share*`, `robkit-fake-commands*`, `robkit-pm*`, `robkit-t*`, `robkit-phase*` and `robkit-wsl*`: nothing in today's code makes them.
  A shared helper that makes a temp folder and hands it to `removeWhenGone` would fix them in one place.
- **A teardown race in WSL.** Once, removing an install hit `ENOTEMPTY` on `apps/example/dist/dev/types` while Next dev was still writing there, and vitest exited 1. I only saw it in WSL.
- **`doc-examples.test.ts` timed out once in CI.** In repo-checks, "compile against the built packages" ran past its 30 s timeout in run 42711930226, attempt 1. It passed on the rerun and in the WSL gate. It compiles every docs example in one test, so it slows down as the docs grow.

### Merged

Added by the lead. PR 75 merged into `m1-the-subdomain-boundary` on 2026-11-09, with `gate` green on `8458f43`.

### A port two tests shared, 2026-11-11

Added by the lead, from a CI failure on milestone 4's pull request (PR 119).

CI's `check` failed once on `6ec738ed`. In `packages/core/src/robkit-core.db.test.ts` a request to core answered 201 where the test expected 200. `freePort()` asked the system for an unused port, closed it and handed the number back. Before core listened there, another package's test server took the same port, so the request reached that server. The job passed when re-run.

`freePort()` now leases its port the way `freePortBlock` does, from 20000 to 29999 with a lease file in the temp folder, so no two tests on one machine get the same port (`a646c8c8`). Every caller keeps its call.
