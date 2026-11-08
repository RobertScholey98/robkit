# 0003: Core signs session tokens, and apps verify them locally

**Status:** accepted, 2026-10-28 (R). Source: [What session token and guard does the kit ship?](../../.scratch/kit/issues/07-session-and-guard.md)

## Context

Every request to every app needs to know who is asking. Asking core on each request would put core in the path of every page load.

## Decision

A session token is a JWT that core alone signs with Ed25519. Core publishes its public key at `/.well-known/jwks.json`. Each app's guard fetches that key once and verifies tokens locally. Tokens last 15 minutes, and core renews them through its `/refresh` route while the session lives (30 days).

## Consequences

- A guard can decide without calling core, apart from fetching the key once and the app's access rule once a minute.
- A change of roles reaches a guest within one token lifetime, because the token carries the roles.
- After sign-out, an app the browser opened in the last 15 minutes still lets it in until that app's token expires. The map lists this as a known gap.
