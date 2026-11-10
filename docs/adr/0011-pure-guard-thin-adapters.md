# 0011: The guard is a pure function, and adapters are thin

**Status:** accepted, 2026-10-28 and 2026-11-03 (R). Sources: [What session token and guard does the kit ship?](../../.scratch/kit/issues/07-session-and-guard.md), [The guard's own tests](../../.scratch/v0.1-build/issues/27-request-guard-tests-and-contract.md)

## Context

robkit supports more than one stack, and each needs the same access decision. If each stack's glue made the decision itself, the stacks would drift apart, and a security fix would have to land in each.

## Decision

The guard (`@robkit/guard`) is a pure function from an access rule and a session state to one of four outcomes: allow, login, refresh or not found. It imports no framework and does no I/O. `requestGuard` in `@robkit/session` runs it on a web-standard `Request`: it reads the app's cookie, verifies the token, fetches the rule and answers the `/_robkit/*` paths. Each adapter (`@robkit/hono`, `@robkit/start`) only turns `requestGuard`'s answer into its framework's shape. `conformance.json` holds the cases the guard and every adapter must pass.

> **Note, 2026-11-10:** there are four adapters now: `@robkit/hono`, `@robkit/express`, `@robkit/next` and `@robkit/start`, and a React + Go app runs the Go port ([0013](0013-go-guard-is-a-port.md)). `requestGuard` also refuses a write from another origin and sends the headers that stop another origin framing the app ([0015](0015-sibling-subdomains-are-a-boundary.md)). Each adapter also has a `/serve` entry that serves the built app and a `/testing` entry for tests ([0016](0016-platform-wiring-lives-in-packages.md)).

## Consequences

- A new stack's adapter is a few dozen lines, plus a test that runs the conformance cases through it.
- Adapters import `@robkit/session` and `@robkit/guard`, never core. ESLint enforces it.
- App code never reads the session cookie or verifies a token. It takes the viewer from its adapter.
