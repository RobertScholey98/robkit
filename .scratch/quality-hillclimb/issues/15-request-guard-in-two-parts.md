# 15: The request guard in two parts, with failures that keep their cause

**What to build:** `requestGuard` reads as its decision. The sign-in callback and token refresh protocol lives in its own module, with its state and cookie rules together. A failure to read core's access rules says which failure it was.

Today `packages/session/src/request-guard.ts` is about 420 lines. It mixes the callback handler (`arrive`, `stateIn`, `sameState`, `nextOn`), the cache of access rules, refresh and the per-request decision. `core-access.ts` throws the same plain error for an unknown app, a bad answer, invalid JSON and an interrupted body.

Raises rubric categories 5 (simplicity), 7 (error handling) and 1 (module boundaries). Evidence: `../research/council-r2-opus.md` sections 5 and 7; `../research/council-r2-sol.md` sections 5 and 7; `../research/council-r2-sonnet.md` section 1.

- Pin the behaviour first. The conformance table and the adapter tests must pass unchanged.
- Move the callback and refresh protocol into one private module, and the cache of access rules into another if that reads better. `requestGuard` stays the only public export and becomes a short dispatcher: read the session, read the rule, decide, respond. Each file stays under about 200 lines.
- `core-access.ts` tells an unknown app from a bad answer, invalid JSON and an interrupted body read. It keeps each underlying error as `cause`, and `GuardFault` carries which failure it was. Test each case in `core-access.test.ts`.
- Refactor commits come before the behaviour change, each on its own. Add a changeset, and regenerate the API report if it changes.

**Blocked by:** 14

**Status:** done

- [x] `requestGuard` is a dispatcher, and the callback and refresh protocol is its own module
- [x] No file in session's `src` is over about 200 lines, tests aside
- [x] Core-access failures say which one happened and keep their cause, each with a test
- [x] The conformance and adapter tests are unchanged
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **Four files.** `request-guard.ts` (200 lines) holds the options, `GuardFault` and the dispatcher: answer the guard's own paths, read the session, read the rule, `guard`, respond. `refresh-protocol.ts` (199) holds the trip through core and back: the state cookie, the callback (`arrive`), `toCore`, and reading the session from the app's own cookie, since the signed-out marker it reads is the one the callback writes. `guard-http.ts` (88) holds the request and response helpers: `publicUrl`, `nextOn`, `isNavigation`, `isBrowserNavigation`, `text`, `redirect` and `hostOnlyCookie`. The cache of access rules was already in `core-access.ts`, so it stayed there.
- **The four failures** are the ticket's words: `unknown-app` (core answered 404), `bad-answer` (any other status that isn't 2xx, or JSON that isn't a rule), `invalid-json` and `interrupted-body`. `core-access.ts` throws an `AccessRuleError` with `failure` set. Its cause is the JSON parser's `SyntaxError`, the body read's error, or the reader's `InputProblem` for a rule that isn't one; a bad status has no error underneath, so no cause. I read the body with `res.text()` and `JSON.parse` rather than `parseJson`, because `parseJson` keeps only the parser's message, not the error. The messages are the ones the guard's tests already checked, plus two new ones.
- **GuardFault is now a union.** Only an `access-rule` fault has `reason`, so a key or network fault can't carry one; `request-guard.test-d.ts` checks both ways. `AccessRuleFailure` is exported as a type. The class stays internal: `reason` says which, and nobody outside session needs `instanceof`. coreAccess throws only an `AccessRuleError` (core answered) or a `CoreUnreachableError` (it didn't), so the guard maps anything else to `network`. The default report's line is unchanged; its cause already names the failure.
- **loopbackFetch answers on the headers.** It used to wait for the whole body, so a body cut off part way rejected the request and read as `network`. Real `fetch`, which production uses, answers on the headers and fails the body read. Now both do, so `interrupted-body` happens in dev too and the test can reach it. The body is a `ReadableStream` built from the response's events, not `Readable.toWeb` or `ReadableStream.from`: e2e type-checks session's source with the DOM lib, where neither fits `Response`. Cancelling the body lets go of the connection.

### Proof

- Each refactor commit kept the guard's, hono's and start's tests passing unchanged. I built and tested session at each commit on its own.
- Went red first: the loopback test of a body cut off ("Error: aborted" from the request itself), the cancel test (times out without `cancel`), the four core-access failure tests (no `AccessRuleError`), the guard's `reason` test and its type test. "names core being down when it loads the rule" passed on the old code too: it pins the `network` branch the new mapping added.
- `pnpm check` on Windows: 48 of 48 tasks pass. Session, hono and start tests in WSL: 147, 28 and 29 pass. Session's coverage: 97.97 / 94.17 / 100 / 99.23, all above its thresholds.
- A scratch script with a 300 ms limit and a body that never ends: `loopbackFetch`'s body read failed after 304 ms, so the deadline still covers the body.
- CI on PR #60: `check`, `pull-request` and `gate` pass at 3ee1acf, https://github.com/RobertScholey98/robkit/actions/runs/42172483377.
- The first CI run failed in dev's `runner.db.test.ts` ("stops everything and fails when an app exits": only beta had started). Dev uses only session's `addresses` and `reportToConsole`, which this ticket didn't change. Run alone in WSL with `--retry=0`, that file passed 3 of 3 times on this branch. On the base (051675c) it failed 1 of 3, on a different test in the same file. So it is flaky under load, not caused by this ticket. The rerun's `check:all` passed.
- The rerun then failed only on the coverage ratchet, which asked for session's functions threshold to go from 97 to 100. It now does.

### What I couldn't verify

- The whole-stack test (`tooling/e2e`) didn't run locally, because other tickets were running; CI runs it.
- `interrupted-body` through global `fetch` (production, not `*.localhost`). The tests reach it through `loopbackFetch`, which now behaves the same way.

### For ticket 16 (`docs/conventions/errors.md`)

- "Unexpected faults throw": next to `CoreUnreachableError`, `AccessRuleError` in `@robkit/session` marks a load of an app's access rule that core answered wrongly. Its `failure` says how: `unknown-app`, `bad-answer`, `invalid-json` or `interrupted-body`, and its cause keeps the parser's or the read's error.
- "Boundaries turn both into an answer", the guard bullet: an `access-rule` fault also has a `reason`, one of those four, so `onUnavailable` can tell "core doesn't know this app" from a broken answer without reading the message.
- The timeout table's 5 seconds for the access rule now covers reading the body as well as the headers, in dev as in production.

### For ticket 19

- `request-guard.test.ts` gains two tests in "when it can't check a request", just before "names core's key when core answers but its key set won't load". Nothing else in that file changed, so its brand casts are still there for 19 to remove.
- `request-guard.test-d.ts` gains one test and imports `AccessRuleFailure` and `GuardFault`.
- `core-access.test.ts`'s fake core gains `raw` and `cutOff`. Its `server.address() as AddressInfo` cast is unchanged. The new `loopback-fetch.test.ts` has no casts.
