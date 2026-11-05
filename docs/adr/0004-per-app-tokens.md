# 0004: Each app holds its own app token

**Status:** accepted, 2026-11-05 (R). Source: [Per-app session tokens](../../.scratch/app-sharing/issues/02-per-app-tokens.md)

## Context

robkit first put one session cookie on the parent domain, so every app received it. Once owners import apps written by other people, that cookie would let any app act as the viewer on every other app, admin included.

## Decision

No cookie goes on the parent domain. Core's own session token has the audience `core` and sits in a host-only cookie on core's host, and core reads no other. Each app, admin included, holds its own app token, with its slug as the audience and no session id, in a host-only cookie on its own host. The guard accepts only a token for its own slug.

An app with no token of its own sends a page load to core's `/refresh` with a random state. Core sends the browser back to the app's `/_robkit/session` with a token for that app, or none if nobody is signed in. A call whose token lapsed goes through the app's `/_robkit/refresh`. The guard answers both paths itself.

## Consequences

- An imported app can't use the token it holds to open admin or any other app, and core never renews from an app token.
- Core hands an app its token in the callback's URL, so a proxy that logs URLs logs that app's token, good for 15 minutes on that app alone.
- Any app can still learn who a visitor is by sending them through `/refresh`. An app needs that to serve them.
