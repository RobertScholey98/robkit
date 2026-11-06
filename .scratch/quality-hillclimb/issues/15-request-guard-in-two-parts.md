# 15: The request guard in two parts, with failures that keep their cause

**What to build:** `requestGuard` reads as its decision. The sign-in callback and token refresh protocol lives in its own module, with its state and cookie rules together. A failure to read core's access rules says which failure it was.

Today `packages/session/src/request-guard.ts` is about 420 lines. It mixes the callback handler (`arrive`, `stateIn`, `sameState`, `nextOn`), the cache of access rules, refresh and the per-request decision. `core-access.ts` throws the same plain error for an unknown app, a bad answer, invalid JSON and an interrupted body.

Raises rubric categories 5 (simplicity), 7 (error handling) and 1 (module boundaries). Evidence: `../research/council-r2-opus.md` sections 5 and 7; `../research/council-r2-sol.md` sections 5 and 7; `../research/council-r2-sonnet.md` section 1.

- Pin the behaviour first. The conformance table and the adapter tests must pass unchanged.
- Move the callback and refresh protocol into one private module, and the cache of access rules into another if that reads better. `requestGuard` stays the only public export and becomes a short dispatcher: read the session, read the rule, decide, respond. Each file stays under about 200 lines.
- `core-access.ts` tells an unknown app from a bad answer, invalid JSON and an interrupted body read. It keeps each underlying error as `cause`, and `GuardFault` carries which failure it was. Test each case in `core-access.test.ts`.
- Refactor commits come before the behaviour change, each on its own. Add a changeset, and regenerate the API report if it changes.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] `requestGuard` is a dispatcher, and the callback and refresh protocol is its own module
- [ ] No file in session's `src` is over about 200 lines, tests aside
- [ ] Core-access failures say which one happened and keep their cause, each with a test
- [ ] The conformance and adapter tests are unchanged
- [ ] The PR's CI `gate` job passes on GitHub
