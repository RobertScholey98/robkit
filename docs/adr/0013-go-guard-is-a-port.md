# 0013: The Go guard is a port, tested against the same cases

**Status:** chosen in the build of [React + Go](../../.scratch/stacks/issues/03-react-go.md), 2026-11-07, awaiting R's review.

## Context

[0011](0011-pure-guard-thin-adapters.md) keeps every stack's access decision in one place: `@robkit/guard` decides, `requestGuard` in `@robkit/session` runs it on a web `Request`, and each adapter only translates. That works while every app's server runs Node. A React + Go app's server is a Go binary, which can't call TypeScript. It could reach the guard only through a Node process beside it, which would put a second server and a round trip in front of every request, and Node in every Go image.

## Decision

`github.com/RobertScholey98/robkit/go`, in this repo's `go/` folder, ports the guard and the request guard to Go: `guard.Decide` is `@robkit/guard`'s decision table, and `session.Guarded` is `requestGuard` for Go's `net/http`: it wraps the app's `http.Handler`, whose handlers read the viewer with `session.ViewerFrom`. It verifies tokens as `jose` does for the TypeScript guard, and imports nothing outside Go's standard library.

The two stay one guard by their tests. `go test` runs `packages/guard/conformance.json`, which the TypeScript guard and every adapter run, and the request guard's cases against a port of `@internal/test-session`'s fake core: the same cookies, redirects, 401 bodies and 503s.

## Consequences

- A change to the guard or the request guard lands in both languages, in one pull request, and `conformance.json` gets a case for it. The gate runs `go vet` and `go test`, so contributors need Go.
- A Go app's image builds the binary with Go and runs it alone; it needs nothing from `node_modules`.
- The module isn't on a Go module proxy. An app's `go.mod` reaches it with a `replace`, to the checkout under `--link` and to `vendor/robkit/go` after `robkit vendor`. Publishing it needs a version tag, which waits for robkit's release flow.
