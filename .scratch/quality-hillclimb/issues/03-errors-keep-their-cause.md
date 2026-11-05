# 03: Errors keep their cause and say what to do

**What to build:** Every failure is either an expected outcome the caller handles, or an unexpected fault that keeps its cause and reaches someone who can act on it. Nothing is swallowed, nothing outbound waits forever, and every message a person reads tells them what to do next.

Raises rubric categories 7 (error handling) and 6 (consistency). See `../research/robkit-round-0.md` section 7 for the sites, and `../research/t3code.md` section 7 for the pattern that scored 8 (tagged failures with causes and bounded context, explicit recovery for optional features).

- `docs/conventions/errors.md`: the convention in a page. Expected failures are values: a discriminated union with a reason, as the guard's outcomes already are. Unexpected faults throw an `Error` with `cause`. A boundary (HTTP route, CLI command, adapter) turns both into a response or exit code with a message that says what to do. A `catch` only translates, recovers with a logged reason, or rethrows with `cause`. Ticket 01 links this page. List anything `AGENTS.md` should say under this ticket's `## Comments` instead of editing it.
- `requestGuard` in `@robkit/session` still answers 503 when it can't verify, but hands the cause to a diagnostic callback the adapter can set, which by default logs the app's slug, what failed (core's key, the access rule, the network) and the cause. An unknown app, a malformed rule and core being down are told apart in the log.
- Core has one handler for unexpected errors (`app.onError`) that logs the route and the cause and answers a generic JSON error. The health check logs why the database is unreachable.
- Every outbound request robkit makes has a timeout (`AbortSignal.timeout`), including Coolify's, and the Coolify deploy's overall deadline also bounds a request in flight. A Coolify failure names the step, the app and what to check.
- Each command line (`create-robkit`, `robkit`, `robkit-dev`) has one top-level handler: a known problem prints its message and exits non-zero without a stack, and an unexpected fault prints the stack and where to report it.
- Lint: ESLint's `preserve-caught-error`, and a `robkit/no-silent-catch` rule (with tests, like the other rules in `tooling/eslint`) that fails a `catch` which discards its error with no comment saying why.
- Each behaviour above has a test that fails without it.

**Blocked by:** none

**Status:** done

- [x] `docs/conventions/errors.md` exists
- [x] The guard's 503 reports its cause through a callback, and the three causes are told apart
- [x] Core logs every unexpected error with its cause and answers a generic error
- [x] Every outbound request has a timeout, and the deploy deadline bounds a request in flight
- [x] Each command line prints known problems without a stack and exits non-zero
- [x] `preserve-caught-error` and `robkit/no-silent-catch` are on, with no disable comments in non-test source
- [ ] The gate passes: `pnpm turbo run lint typecheck test`

## Comments

**What I chose.**

- The guard's callback is `onUnavailable(fault)` on `GuardedOptions`, so the Hono and Start adapters pass it through unchanged. `fault.failed` is `core-key`, `access-rule` or `network`. An unknown app and a malformed rule are both `access-rule`, told apart by the cause's message ("Core doesn't know an app called example." and "Core sent an access rule for example that isn't one."). Core being down is `network`: calls to core now go through `coreFetch`, which wraps a request that gets no answer in `CoreUnreachableError`, keeping the network's error as its cause.
- Core takes a `logError(message, cause)` option, `console.error` by default. `app.onError` logs `GET /path failed.` with the cause and answers `{ error: "Core hit an unexpected error. Its log says what went wrong." }` with 500. An `HTTPException` keeps its own response.
- `Problem` and `runCommand` live in `@robkit/dev`, because create-robkit already depends on it. Every throw in create-robkit's command code is a `Problem` except `generate.ts` and `robkit-repo.ts`, which mean robkit itself is broken. `runDev` now throws what failed once everything has stopped, rather than printing it.
- Timeouts: one Coolify request gets 30 seconds, and the 20-minute deadline per app's deploy is an abort signal on each request. The template's `callCore` gets 10 seconds. The guard's rule fetch (5 seconds) and jose's key fetch (5 seconds) already had one. The production journey's sign-in fetch gets 10 seconds.
- Left without a timeout: `sessionFetch` passes the app's own request through, so its caller sets the signal. The dev proxy forwards to local apps, and a timeout there would cut off long-lived requests such as Vite's HMR. The Dockerfile's `HEALTHCHECK` is bounded by its `--timeout=3s`.
- `robkit/no-silent-catch` accepts a comment inside the `catch` block or handler, or on the line directly above the statement holding a `.catch()` call.

**Proof.** Each new test failed on the code before its change, then passed.

- `pnpm turbo run lint typecheck`: 33 of 33 tasks pass, with both rules on. `prettier --check .` passes.
- On Windows: `@internal/eslint-config` 51, `@robkit/session` 126, `@internal/test-session` 16, `create-robkit` 115, `@robkit/hono` 26, `@robkit/start` 27 tests pass.
- In WSL: `@robkit/core` 19 files, `@robkit/dev` 54 tests and `@internal/test-postgres` 2 files pass. Core's three new tests and dev's new fault test fail against the old `app.ts` and `runner.ts`.
- The template's `callCore` tests (11) pass with vitest run in its folder.

**Not verified.** The whole gate in one run, and `tooling/e2e`, which also typechecks the template's `callCore` inside a generated install. The coordinator runs both on the merged round.

**For ticket 02.** `readCoolifyConfig` and `readInstallChoices` still `JSON.parse` without a check. A malformed `coolify.json` or `robkit.json` now prints as a fault with a stack and the report link. Making those `Problem`s that name the file belongs with ticket 02's parsing.

**What AGENTS.md should say** (ticket 01 owns it):

- Link `docs/conventions/errors.md` from Conventions, with one line: expected failures are values, faults throw with `cause`, a fixable command-line failure is a `Problem` from `@robkit/dev`, and every outbound request has a timeout.
- In the `@robkit/session` bullet: `requestGuard` answers 503 when it can't check a request and tells `onUnavailable` why. By default it logs the app, what failed and the cause.
- In the `@robkit/core` bullet: `createApp` takes `logError`. Every unexpected error and an unreachable database are logged there.
- In the layer rule: `tooling/eslint` also enforces `preserve-caught-error` and `robkit/no-silent-catch`.
