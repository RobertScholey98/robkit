# 0018: robkit's Go module travels in the install

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decision 12), and built by [create-robkit runs outside the checkout](../../.scratch/just-use-it/issues/13-create-robkit-outside-the-checkout.md), 2026-11-10. What the build chose awaits R's review.

## Context

A React + Go app's server imports robkit's Go module, `github.com/RobertScholey98/robkit/go` ([0013](0013-go-guard-is-a-port.md)). The module isn't on a Go module proxy. An app's `go.mod` reached it with a `replace`: to the checkout in a linked install, and to `vendor/robkit/go` after `robkit vendor`. An install made from the registry has no checkout, and publishing the module would need a version tag and robkit's release flow.

## Decision

create-robkit carries the Go module's source, as it carries the catalog and the lint policy. init and `robkit add` write it to the install's `vendor/robkit/go` whenever they write a Go app, the first Go app added to an install included. The app's `go.mod` keeps its `replace` to `../../vendor/robkit/go`. A linked install still points at the checkout.

## Consequences

- robkit's Go module is never fetched, so nothing waits on a Go proxy or a tag for it. The app's other modules, such as pgx, still come from the public proxy.
- The module an install builds against is the one its create-robkit carried. `robkit upgrade` writes the new one where the install has a Go app, and puts `vendor/robkit/go` back if a step fails ([0021](0021-upgrade-runs-in-two-steps.md)).
- `robkit vendor` stays, for a linked install that deploys.
- create-robkit's build names the Go module as an input in `turbo.json`, so a cached build can't ship an old copy.
