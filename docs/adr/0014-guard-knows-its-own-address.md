# 0014: The guard knows its own address

**Status:** chosen in the build of [The guard knows its own address](../../.scratch/just-use-it/issues/01-guard-knows-its-own-address.md), 2026-11-09, awaiting R's review.

## Context

The guard sends the browser to core, to the hub and back to the app, so it builds URLs that name the app. It took the app's host from the request's `Host` header and the protocol from `X-Forwarded-Proto`, and Express and Next built the request's URL from `Host` themselves. A proxy hop that rewrote either header changed where the guard sent the browser. The [review of 2026-11-09](../../.scratch/just-use-it/research/review-2026-11-09.md) found three faults that follow from that.

## Decision

The guard works out the app's origin from its settings, never from the request. `appOrigin` in `@robkit/session` is `coreInstall(core).origin(app)`: core's protocol and port, on `<app>.<domain>`. `requestGuard` works it out once, and every URL it builds is that origin plus the request's path and query. No header decides the address, in either port: Go's `Guarded` builds its URLs the same way from `ReadGuardEnv`'s options.

Adapters hand the guard a path. Express and Next put the request's path and query on the app's origin with the URL setters, so a request for `//evil.com/x` stays a path on the app.

## Consequences

- `ROBKIT_CORE_URL` is the only thing that makes the guard's URLs https. `robkit deploy` sets it over https.
- A request with no `Host`, or an empty one, is guarded like any other. Express's and Next's 400 for one is gone.
- The request cases both ports run live in `tooling/test-session/request-cases.json`, beside the guard's own `conformance.json`. Later tickets add their kinds there.
- Every later rule that compares against the app's own origin, such as the cross-origin rule in [0015](0015-sibling-subdomains-are-a-boundary.md), rests on this.
