# 27: The request guard's own tests, and its contract with `sessionFetch`

**What to build:** `requestGuard` in `@robkit/session` holds the adapters' behaviour, but its 401 vs 302, 503 and forwarded-protocol behaviour is tested only through the Hono adapter. After this ticket it has its own tests. Each adapter's tests keep only the conformance cases and its framework glue, with one shared fake core. A third stack's adapter then inherits tested behaviour.

The guard's 401 for a lapsed session is a contract with `@robkit/react`'s `sessionFetch`: a header and a body shape. Today `sessionFetch` copies both as plain strings, so a change on one side breaks nothing. After this ticket `@robkit/react` takes the contract from `@robkit/session`, which the layer rule allows, and a change on either side fails a test. `coreKeys`, `coreAccess` and the `keys` option stop being public, since only `requestGuard` and tests use them.

**Blocked by:** None (can start immediately)

**Status:** needs-info

- [ ] `@robkit/session` tests `requestGuard`'s page-load and fetch answers, its 503s, its forwarded protocol and its refusal of a bad core origin
- [ ] The Hono and Start adapter tests share one fake core and one conformance table
- [ ] `sessionFetch` reads the header name and body shape from `@robkit/session`, and its tests use them
- [ ] `coreKeys`, `coreAccess` and the `keys` option are no longer exported
- [ ] The whole-stack test passes

**Open:**

- Who owns `next` in the 401's location? The guard sets it to the URL that was called, such as a server function, and `sessionFetch` always overwrites it with the page's URL. Recommended: the guard's 401 leaves `next` out, and `sessionFetch` adds the page's URL, so the contract says who supplies it.

Source: the architecture review of 2026-11-03 (see the map)
