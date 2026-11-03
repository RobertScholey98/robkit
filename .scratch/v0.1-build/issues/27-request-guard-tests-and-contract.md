# 27: The request guard's own tests, and its contract with `sessionFetch`

**What to build:** `requestGuard` in `@robkit/session` holds the adapters' behaviour, but its 401 vs 302, 503 and forwarded-protocol behaviour is tested only through the Hono adapter. After this ticket it has its own tests. Each adapter's tests keep only the conformance cases and its framework glue, with one shared fake core. A third stack's adapter then inherits tested behaviour.

The guard's 401 for a lapsed session is a contract with `@robkit/react`'s `sessionFetch`: a header and a body shape. Today `sessionFetch` copies both as plain strings, so a change on one side breaks nothing. After this ticket `@robkit/react` takes the contract from `@robkit/session`, which the layer rule allows, and a change on either side fails a test. `coreKeys`, `coreAccess` and the `keys` option stop being public, since only `requestGuard` and tests use them.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `@robkit/session` tests `requestGuard`'s page-load and fetch answers, its 503s, its forwarded protocol and its refusal of a bad core origin
- [x] The Hono and Start adapter tests share one fake core and one conformance table
- [x] `sessionFetch` reads the header name and body shape from `@robkit/session`, and its tests use them
- [x] `coreKeys`, `coreAccess` and the `keys` option are no longer exported
- [x] The whole-stack test passes

**Answered:**

- Who owns `next` in the 401's location? The guard set it to the URL that was called, such as a server function, and `sessionFetch` always overwrote it with the page's URL. The guard's 401 now leaves `next` out, and `sessionFetch` adds the page's URL. Page loads still get a redirect with `next`. (Chosen in the build, awaiting R's review.)

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The contract.** `@robkit/session/lapsed` holds the guard's 401 for a call: `sessionLapsedHeader`, `sessionLapsedResponse`, which the guard writes it with, and `readSessionLapsed`, which `sessionFetch` reads it with. It imports nothing, so a browser bundle can load it without `node:http`. `@robkit/react` now depends on `@robkit/session` for it.
- **The fake core.** `fakeCore()` in `@internal/test-session` serves a signing key's JWKS and each app's rule on a loopback port, and stops when the test ends, so call it inside a test. `conformanceAnswer(case, page, coreOrigin)` is what every adapter answers a conformance case's page load with. A third adapter's test is the conformance loop plus its own glue; see `packages/hono/src/guarded.test.ts`.
- **No cycle.** `@internal/test-session` no longer imports `@robkit/session`, because session's tests use it and turbo refuses a workspace cycle. It writes the cookie name and token lifetime out, and session's guard tests fail if they drift.
- **For ticket 28.** `platformOrigins` (core's origin to the hub's) and `publicUrl` (the forwarded scheme) live in `packages/session/src/request-guard.ts`, and `conformanceAnswer` swaps `core.` for `hub.` again in test-session. With 28's module in `@robkit/session`, test-session can't import it without bringing the cycle back, so it keeps its own copy or the module goes in a package test-session may import.
- **Gate.** One WSL run died at startup with `ENOTEMPTY ... node_modules/.vitest-cache`, two vitest processes clearing the shared cache at once. A rerun passed. It's load, not this change.
