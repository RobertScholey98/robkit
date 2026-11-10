# github.com/RobertScholey98/robkit/go

robkit's guard for an app whose server is Go, the React + Go stack's. It ports `@robkit/session`'s request guard and `@robkit/guard`'s decision table, and passes the same `packages/guard/conformance.json`.

An install reaches it with a `replace` directive in the app's `go.mod`: to this folder in a robkit checkout under `--link`, and to `vendor/robkit/go` after `robkit vendor`. It isn't on a Go module proxy yet.

## Example

From the template, `packages/create-robkit/templates/stacks/go/server.go`, cut down:

```go
options, err := session.ReadGuardEnv(os.Getenv)
if err != nil {
	return err
}
guarded, err := session.Guarded(options)
if err != nil {
	return err
}
mux := http.NewServeMux()
mux.HandleFunc("POST /api/me", func(w http.ResponseWriter, r *http.Request) {
	switch viewer := session.ViewerFrom(r.Context()).(type) {
	case guard.Owner:
		fmt.Fprintf(w, "Hello, owner %s", viewer.ID)
	case guard.Guest:
		fmt.Fprintf(w, "Hello, guest %s with roles %v", viewer.ID, viewer.Roles)
	case guard.Nobody:
		fmt.Fprint(w, "Hello, whoever you are")
	}
})
return http.ListenAndServe("127.0.0.1:3000", guarded(mux))
```

## Packages

`session`:

| Name                                   | What it is                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Guarded(options)`                     | The guard, as a `func(http.Handler) http.Handler`. It answers `/_robkit/session` and `/_robkit/refresh` itself, refuses a write from another origin, and refuses options that won't do |
| `Options`                              | `App` (the slug), `Core` (core's public origin), an optional fixed `Access` rule, an optional `OnUnavailable`, and `Now`, the clock                                                    |
| `ReadGuardEnv(getenv)`                 | `Options` from `ROBKIT_APP` and `ROBKIT_CORE_URL`, which `pnpm dev` and `robkit deploy` set. Its error says how to fix each variable                                                   |
| `ViewerFrom(ctx)`                      | Who is asking, a `guard.Viewer`. It panics for a request that didn't come through `Guarded`                                                                                            |
| `WithViewer(ctx, viewer)`              | A context carrying a viewer, for testing a handler                                                                                                                                     |
| `Fault`, `Failed`, `AccessRuleFailure` | What `OnUnavailable` hears when the guard answers 503: what failed (`core-key`, `access-rule` or `network`), how core's answer for the rule failed, and the cause                      |

`guard`:

| Name                                               | What it is                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Viewer`: `Owner`, `Guest`, `Nobody`               | Who is asking. Each marshals to JSON as the TypeScript guard hands it over: `{"kind": "owner", "id": ...}` |
| `AccessRule`: `OpenRule`, `RolesRule`, `OwnerRule` | Who may open an app                                                                                        |
| `Decide(rule, session)`                            | The decision table: `Allow`, `Login`, `Refresh` or `NotFound`                                              |
| `ReadAccessRule(json)`                             | Reads a rule core sent as JSON                                                                             |
| `RoleID`, `CodeID`, `SessionState`                 | A role's id, an access code's id, and what the app knows of who is asking                                  |

## What it must never do

- Import anything outside Go's standard library. An app's build fetches its own dependencies, not robkit's.
- Decide differently from `conformance.json`, or answer differently from `@robkit/session`. Change them together.
- Accept a token for another audience, put a cookie on the parent domain, or take core's address, or the app's own, from the request. It reads no `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto`: every URL it builds is the app's origin, worked out from `Options`, plus the request's path and query.

## For contributors

- `pnpm --filter @internal/go test` runs `go test ./...`; `lint` checks gofmt, and `typecheck` runs `go vet`. Both gates run them, so `pnpm check` needs Go on your `PATH`.
- The tests run the guard's conformance cases and the request guard's cases against `internal/fakecore`, which ports `@internal/test-session`'s fake core. `internal/conformance` reads `packages/guard/conformance.json`, and the request guard's cases in `tooling/test-session/request-cases.json`, from the checkout.
- It verifies tokens as `jose` does for the TypeScript guard: EdDSA only, the key picked from core's JWKS by `kid`, fetched once and kept, and fetched again for a `kid` it lacks at most every 30 seconds. `docs/adr/` records why it ports rather than wraps.
