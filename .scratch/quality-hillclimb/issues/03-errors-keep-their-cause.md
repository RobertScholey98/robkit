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

**Status:** ready-for-agent

- [ ] `docs/conventions/errors.md` exists
- [ ] The guard's 503 reports its cause through a callback, and the three causes are told apart
- [ ] Core logs every unexpected error with its cause and answers a generic error
- [ ] Every outbound request has a timeout, and the deploy deadline bounds a request in flight
- [ ] Each command line prints known problems without a stack and exits non-zero
- [ ] `preserve-caught-error` and `robkit/no-silent-catch` are on, with no disable comments in non-test source
- [ ] The gate passes: `pnpm turbo run lint typecheck test`
