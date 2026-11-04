# 36: The full gate passes in one run on a dev machine

**What to build:** AGENTS.md tells contributors to run `pnpm turbo run lint typecheck test`. On origin/main that passes in about 3 minutes in WSL on a 16-core machine with Docker Desktop. Since tickets 20 to 32 it no longer passes in one run there: `@internal/test-postgres`'s "gives each caller its own Postgres" times out at 120 seconds, though it passes in 22 seconds alone, and test and e2e Postgres containers sit in `Created` while the gate runs. A failed or interrupted run also leaves `robkit-test-*` and `robkit-e2e-*` containers and volumes behind. After this ticket, the cause is found and fixed, the gate passes in one run on a dev machine, and a run that fails or is stopped cleans up after itself.

**Blocked by:** 32

**Status:** done

- [x] The full gate passes three runs in a row in WSL, each in one command
- [x] A failed or interrupted run leaves no robkit containers or volumes behind
- [x] CI stays green

Source: the gate runs of tickets 32 and 36 (2026-11-04)

## Comments

- **The cause.** No commit on the stack caused it. origin/main (`b415e06`) passed in 2m43s on 2026-11-03, then failed the same way on the same machine a day later. On a dev machine whose Docker shares a disk with everything else, as Docker Desktop in WSL does, the gate is IO-bound. While the journeys ran, tasks were stalled on IO up to 38% of the time (`/proc/pressure/io`, `full avg10`), but on CPU at most 11% after the first lint burst. Docker's daemon stalled too: one `docker ps` took over 50 seconds, and test Postgres containers took minutes to report healthy. The health check gave up after 30 checks, one a second, with no start period, so most of these Postgres containers were declared unhealthy. "container ... is unhealthy" accounted for most of origin/main's failures in WSL.
- **What fixed it.** Each test Postgres keeps its data on tmpfs (`tooling/test-postgres/in-memory.yaml`), so the syncs during its first boot cost nothing. That alone took peak IO pressure from 38% to 15%, and core's tests from 147s to 43s. The install's health check now has a two-minute start period. It checks every second while Postgres starts and every 10 seconds once it is up, since Docker Desktop runs each check as a costly exec. This also helps an owner whose laptop is slow on first boot.
- **Two more failures under load.**
  - Docker refused a test Postgres's port with "port is already allocated". Docker Desktop publishes ports from its own VM, where `freePort()` can't see them. `freePostgresPort()` now also skips every port `docker ps` lists.
  - A failed gate left Postgres containers and fixture apps running; two `serve.js` processes had been running for 12 hours. `removeWhenGone` now starts a detached watcher. Once the test process exits, however it ends, the watcher removes the test's Compose project and stops every process carrying its `ROBKIT_TEST_TAG`. Stopping a process group wasn't enough, since robkit-dev starts each app in a session of its own.
- **Proof.**
  - Three full gates in a row, each `pnpm turbo run lint typecheck test --force` in one command, took 234s, 215s and 214s. All 49 of 49 tasks passed, and nothing was left behind.
  - One gate was interrupted at 70 seconds, with 7 robkit containers and 30 tagged processes running. 25 seconds after turbo exited, none were left.
- **Not fixed: Node segfaults.** Under the gate's load, Node 24.22.2 in WSL segfaulted three times on 2026-11-04, once as ESLint. The crash dumps are in `%TEMP%\wsl-crashes`. The fault is in Node on this machine, not in robkit's code, and a rerun passes.
- **Not covered:** the production stack (`test:production`) names its containers itself and doesn't register them with `removeWhenGone` yet.
