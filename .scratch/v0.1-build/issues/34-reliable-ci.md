# 34: CI passes reliably

**What to build:** About 4 in 10 runs of robkit's CI fail, on `main` and on ticket branches alike, and a rerun of the same commit usually passes. Each failure is a whole-stack browser journey timing out after 30 seconds on a `fill`, `click` or `waitFor`, in a different test each time. After this ticket, the cause of those timeouts is found and fixed, and CI passes run after run on the same commit. Core's `verifyPassword` also turns any scrypt error into `false`, so under load it could refuse the owner's correct password. After this ticket it refuses only a wrong password.

**Blocked by:** 20

**Status:** done

- [x] The root cause of the journey timeouts is named, with evidence from failed runs, and fixed rather than waited out
- [x] Five consecutive CI runs of the same commit pass
- [x] `verifyPassword` refuses only wrong passwords; an unexpected scrypt error fails loudly instead of reading as a wrong password
- [x] The WSL gate still passes

Source: the CI history of tickets 04 to 20 (2026-11-04)

## Comments

- **The cause.** On CI's runner Docker runs natively, so each compose project's network adds host interfaces when it starts and removes them when it stops. Chromium takes that as the network changing and fails the requests it has in flight with `net::ERR_NETWORK_CHANGED`. A Vite page that loses one module never draws, so the journey waits 30 seconds for an element that never comes. The browser log caught it in both failures of a five-copy run: a hub page lost `react.js` and an admin page lost `input.tsx`, each about four minutes in, while other installs were starting or stopping their Postgres. Docker Desktop keeps its networks in its own VM, which is why the suite never failed in WSL, even pinned to 2 CPUs. The `core.signing_keys does not exist` error in every run, passing ones too, comes from a test that starts core without migrating, and isn't related.
- **The fix.** `tooling/test-postgres/host-network.yaml` runs an install's Postgres on the host's network, listening on 127.0.0.1 at `ROBKIT_POSTGRES_PORT`, so it adds no interface. CI names it in `COMPOSE_FILE`, which every compose command without `-f` reads: `pnpm dev`, the runner tests, the whole-stack test, an install's own Playwright tests, and `@internal/test-postgres`, which now runs from the template's folder instead of passing `-f`. Before the fix, two of five parallel copies of the CI job failed; after it, ten of ten passed (five copies, run twice, on the same commit).
- **Seeing the next one.** Every journey launches Chromium through `tooling/e2e/src/browser.ts`, which notes console errors, page errors, failed requests, 4xx and 5xx answers and navigations, and each open page's text when the browser closes. A failed journey prints that and what the dev runner said meanwhile.
- **verifyPassword.** A stored hash it can't read (wrong scheme, parameters scrypt can't take, or more than 8 times the memory `hashPassword` uses) still refuses every password, now checked before scrypt runs. Any other scrypt failure throws, and sign-in answers 500, so the owner is never told the right password is wrong. A test makes scrypt fail once and proves it red against the old code. No failure in a CI log came from it, so it wasn't behind the flakes.
- **For 21 and 33:** see their notes. A job that runs journeys on Linux keeps CI's `COMPOSE_FILE`, and the production stack's own networks and redeploys will need the same care when CI runs it.
