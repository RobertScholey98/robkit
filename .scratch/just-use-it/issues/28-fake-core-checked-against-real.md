# 28: The fake core is checked against the real one

**What to build:** The guard's and adapters' tests run against a fake core. It serves only core's keys and an app's access rule, and the tests stand in for `/refresh` with hand-written copies of what core sends back ([review](../research/review-2026-11-09.md), "The fake core serves only JWKS and the access rule"). So a guard that sends core a `next` core would refuse passes every unit test, and only the whole-stack test would catch it. Milestone 1 changed both sides of that exchange, which is when a copy drifts.

There are two fakes. TypeScript's is `fakeCore()` in `tooling/test-session`. Go's guard is tested against `go/internal/fakecore`, which TypeScript's tests never touch.

- **Both fakes' keys look like core's.** Core serves `{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }`, with `kid` the key's thumbprint. Each fake's JWK has the same fields, `use` included, and a `kid` worked out from the key, not a fixed string. Every token a fake signs carries that same `kid`. Today TypeScript's writes `"key-1"` in two places, and Go's JWK has no `use`.
- **One contract test for the helpers.** `refreshLocation` and `callbackFor` in `tooling/test-session` are the copies. The test sends real core's routes what the guard's tests expect a guard to send, and compares what comes back:
  - For each page in `request-cases.json` whose expected answer sends the browser to core's `/refresh`, real core accepts that `next`.
  - Signed in, core answers 302 to exactly `callbackFor(next, { state, token })`, where the token is core's own.
  - Signed out, it answers the same without a token.
  - The token core mints has the claims a fake's app token has, by name, and the app as its audience. Their values differ.
  - A `next` on an app core doesn't know, on the hub, on core, or with the wrong scheme or port, is refused by real core. These hold core to what the guard relies on. They add no new rule to core.
- **Where it lives.** Where it can reach both core's routes and the helpers. It needs Postgres, so it is a `*.db.test.ts`.
- **Nothing else changes.** The fakes stay small. This ticket doesn't make either serve `/refresh`.

This was part of ticket 26, and moved here so it wouldn't collide with milestone 1's changes to the same files.

**Blocked by:** 06

**Status:** done

- [x] Each fake's JWK has the same fields as real core's, and the Go and TypeScript guards' tests pass against them
- [x] A fake's tokens carry the `kid` its JWK has, and no test names a fixed `kid`
- [x] The contract test fails if core's `/refresh` refuses a `next` the request cases expect a guard to send, with a deliberate mismatch shown failing in the Proof
- [x] It fails if core's redirect differs from `callbackFor`, signed in or signed out, with a deliberate mismatch shown failing in the Proof
- [x] It fails if core's app token lacks a claim a fake's has, or has another audience
- [x] The package graph allows the test's imports, with any new edge listed
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

Taken:

- Opus: Go's guard is tested against `go/internal/fakecore/fakecore.go`, whose JWK has `kid` and `alg` and no `use`. As first written, this ticket would have left Go untested against the real shape.
- Both: "each `next` the fake's stand-in accepts or refuses" named nothing. The fake has no code that accepts or refuses. `refreshLocation` matches a URL and `callbackFor` builds one. The bullet now says what is compared with what.
- Sol: the `kid` is written out twice in `tooling/test-session/src/index.ts`, once in the token's header and once in the JWK.
- Sol: a criterion for the callback's shape, not only for `next`.

Order: this merges after tickets 30 and 24, which edit `packages/core`'s coverage thresholds too.

### Chosen in the build, 2026-11-11

- The contract test is `packages/core/src/fake-core.db.test.ts`. Core already lists `@internal/test-session` under `devDependencies`, so the graph needed no new edge.
- Each fake names its key by its RFC 7638 thumbprint, as core does, and serves `use: "sig"`. TypeScript's `signingKey()` now gives `kid` and `jwk` beside `publicKey`. Go's `fakecore.NewKey` takes no `kid` now, and its thumbprint is checked against RFC 8037's worked example.
- A token can still name another key's `kid`: `token({ kid })` in TypeScript, `TokenOptions.Kid` in Go, which Go had already. The two forger tests (`request-guard.test.ts` and Go's `guarded_test.go`) name core's `kid`, so they still reach the signature check rather than the unknown-key path.
- The contract test builds the refresh URL itself and checks it against `refreshLocation` and against each row's expected answer, so the helpers keep their shape and gain no export.
- The pages it checks are each `address` row that isn't signed out and each `cookies` row the guard doesn't read, once per core and page: seven pages over two cores. The refusals change one page per core to another app, the hub, core, the other scheme and another port.
- Go's fake can't reach real core from Go's tests. Go's own test pins its JWK to the field list core serves, and a comment in the contract test points to it.
- The three tests that make a key of their own: `packages/session/src/core-keys.test.ts` runs a small JWKS server standing in for core, so its `kid` now comes from the key and it serves `use`. Its `"key-2"` stays: it's the input naming a key core doesn't have. `packages/core/src/mint-token.test.ts` and `packages/session/src/session-token.test.ts` keep `"key-1"`: each is only the input the test hands over, and nothing looks a key up by it.

### For the docs site

Nothing. This changes tests and test helpers only. An owner, a guest and an app's author see no difference.

### Merged

Added by the lead. PR 117 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `fd4fd552`. The lead read the diff and changed nothing.

No guard, adapter or route of core's had to change for the contract test to pass, so the helpers the guards' tests use already matched real core.

One thing the build found that the ticket didn't name: with each key named by its own thumbprint, a forged token no longer shares core's `kid` by accident. The two forger tests now name core's `kid` on purpose, so they still test a bad signature and not an unknown key.
