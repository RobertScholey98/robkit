# 36: The full gate passes in one run on a dev machine

**What to build:** AGENTS.md tells contributors to run `pnpm turbo run lint typecheck test`. On origin/main that passes in about 3 minutes in WSL on a 16-core machine with Docker Desktop. Since tickets 20 to 32 it no longer passes in one run there: `@internal/test-postgres`'s "gives each caller its own Postgres" times out at 120 seconds, though it passes in 22 seconds alone, and test and e2e Postgres containers sit in `Created` while the gate runs. A failed or interrupted run also leaves `robkit-test-*` and `robkit-e2e-*` containers and volumes behind. After this ticket, the cause is found and fixed, the gate passes in one run on a dev machine, and a run that fails or is stopped cleans up after itself.

**Blocked by:** 32

**Status:** ready-for-agent

- [ ] The full gate passes three runs in a row in WSL, each in one command
- [ ] A failed or interrupted run leaves no robkit containers or volumes behind
- [ ] CI stays green

Source: the gate runs of tickets 32 and 36 (2026-11-04)
