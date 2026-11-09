# 28: The fake core is checked against the real one

**What to build:** The guard's and adapters' tests run against a fake core in `@internal/test-session`. It serves only core's keys and an app's access rule, and stands in for `/refresh` with a hand-written copy of what core sends back ([review](../research/review-2026-11-09.md), "The fake core serves only JWKS and the access rule"). So a guard that sends core a `next` core would refuse passes every unit test, and only the whole-stack test would catch it. Milestone 1 changes both sides of that exchange, which is when a copy drifts.

- **The fake's key looks like core's.** Its JWK has the fields core's has, `use` included, and a `kid` that isn't a fixed string, so Go's key filter is tested against the real shape.
- **One contract test.** It runs what the fake assumes about `/refresh` and the callback against real core's routes: for each `next` and state the fake's stand-in accepts or refuses, real core does the same, and the redirect each sends back has the same shape. It lives where it can reach both, and needs Postgres, so it is a `*.db.test.ts`.
- **Nothing else changes.** The fake stays small. This ticket doesn't make it serve `/refresh` itself.

This was part of ticket 26, and moved here so it wouldn't collide with milestone 1's changes to the same files.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The fake core's JWK has the same fields as real core's, and the Go and TypeScript guards' tests still pass against it
- [ ] The contract test fails if core's `/refresh` and the fake's stand-in disagree about a `next`, with a deliberate mismatch shown failing in the Proof
- [ ] The package graph allows the test's imports, with any new edge listed
- [ ] The PR's CI `gate` job passes on GitHub
