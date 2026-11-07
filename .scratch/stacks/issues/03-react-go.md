# 03: React + Go

**What to build:** `go` becomes a ready stack. The app is a Go server that guards every request, the page included, and serves a React single-page app built with Vite and an API under `/api`. Follow the checklist ticket 01 added to create-robkit's README. The work splits into the Go module, the template, and what the kit needs so an app it doesn't build with Node still fits.

R's decisions (2026-11-07):
- **The app owns its database.** It uses pgx and plain SQL migrations, embedded in the binary and run by its `migrate` subcommand. The install's TypeScript ORM layer doesn't apply to a Go app.
- **The session module is `github.com/RobertScholey98/robkit/go`,** in this repo's `go/` folder. An install's `go.mod` reaches it with a `replace` directive: to the checkout under `--link`, and to `vendor/robkit/go` after `robkit vendor`.

**The Go module**
- Port `@robkit/session`'s request guard and `@robkit/guard`'s decision table to Go. Read the current TypeScript: since v0.1, per-app tokens added an audience and the quality rounds reshaped the guard.
- Requirements:
  - Ed25519 JWS verification against core's JWKS, refetched when a `kid` is unknown
  - the access rule cached as the TypeScript does
  - the same 302 for navigations, the 401 lapse contract (header and JSON body), the 404 and the 503s
  - `*.localhost` reached on 127.0.0.1 with the original `Host`
- API: an `http.Handler` middleware, and a typed way to read the viewer from the request context.
- `go test` runs `packages/guard/conformance.json` and the session tests' cases against a fake core. robkit's gate runs `go vet` and `go test`.

**The template.** `templates/stacks/go`:
- `go.mod`, the server, SQL migrations, an `/api/me` that records a visit and says who is asking, and a React page that shows it.
- The page calls the API with `@robkit/react`'s `sessionFetch`, so a lapse goes to sign-in and back.
- The UI kit and the install's theme apply.
- The `package.json` scripts map the install's tasks to Go: `dev`, `build`, `start` (migrate, then serve), `typecheck` (`go vet`), `lint`, `test` and `migrate`.
- In dev, the Go server listens on `PORT`, guards everything, and proxies page requests and Vite's HMR to a Vite dev server on a port of its own. Only one port is assigned per app.
- `AGENTS.md` describes Go's side: the viewer, calling core over HTTP from the server, migrations.

**What the kit needs**
- The ORM layer skips the Go stack. Say how in the stack table, not in a branch on the name.
- `robkit check`'s rule that app code never reads the session cookie also scans `.go` files.
- The production image builds the Go binary: a Go build stage, used only when the pruned app needs it, and a runtime that still runs `node --run start`.
- `robkit vendor` copies `go/`.
- The install's own CI workflow sets up Go when an app needs it.
- When `go` isn't installed, `pnpm dev`, init and `robkit add` say how to get it, instead of failing deep inside a script.
- CI installs Go.

**Choices, whole-stack test, production, docs:** as in ticket 01.

**Blocked by:** 01

**Status:** done

- [x] The Go module passes the guard's conformance cases and the request guard's contract, under `go test` in the gate
- [x] init `--stack go` and `robkit add --stack go` make a working app, and both wizards offer it
- [x] The app owns its migrations, and the ORM layer doesn't apply to it
- [x] `robkit check` scans Go files for the session cookie
- [x] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [x] The whole-stack journeys pass for a Go install in the pull-request gate
- [x] The production test serves a Go app over https
- [x] A missing Go toolchain gets a message that says how to install it
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

Chosen in the build, awaiting R's review.

- **A port, not a wrapper** ([ADR 0013](../../../docs/adr/0013-go-guard-is-a-port.md)). A Go server can't call the TypeScript guard without a Node process beside it on every request. The module ports `guard.Decide` and the request guard, and `go test` holds it to `conformance.json` and the request guard's cases against `internal/fakecore`, a port of `@internal/test-session`'s fake core. It verifies as `jose` does: EdDSA only, the key picked by `kid`, a refetch for an unknown `kid` at most every 30 seconds, `crit` refused but `b64`.
- **Standard library only.** An app's build fetches its own dependencies, not robkit's, and the module needs none: `crypto/ed25519`, `net/http`, `encoding/json`.
- **The API.** `session.Guarded(options)` returns `func(http.Handler) http.Handler`, and `session.ViewerFrom(ctx)` returns a `guard.Viewer` to switch on: `guard.Owner`, `guard.Guest` or `guard.Nobody`, each marshalling to the TypeScript viewer's JSON. `ViewerFrom` panics for a request that didn't come through the guard, since that is a wiring bug. `session.WithViewer` lets a handler's test hand it a viewer. `session.ReadGuardEnv(os.Getenv)` reads `ROBKIT_APP` and `ROBKIT_CORE_URL` with the TypeScript reader's messages. `OnUnavailable` hears each 503's `Fault`.
- **The stack table.** `go` has `ownsDatabase: true`, which `generate.test.ts`'s Drizzle expectations filter on, and `toolchain: "go"`, which init and `robkit add` check through `toolchainOf`. `robkit-dev` checks for Go when an app has a `go.mod`, since it doesn't know stacks. Go sits after Express in `stacks`, ready stacks first, so the added-app cycle is start → react-hono → express → go → start.
- **The replace.** The template's `go.mod` replaces the module with `../../vendor/robkit/go`. Under `--link`, init and `robkit add` point it at the checkout's `go` folder instead, worked out from the install's `link:` overrides. `robkit vendor` copies `go/` to `vendor/robkit/go`, less its tests and `package.json`, even when no app uses Go yet, so `robkit add --stack go` works after vendoring, and points each Go app back at the copy.
- **Dev.** `go run . dev` picks a free port, starts Vite there with `PORT` overridden, waits for it to listen, and serves on `PORT` with the guard in front of everything. What isn't the API goes to Vite through `httputil.ReverseProxy` with the browser's `Host`, which carries Vite's HMR WebSocket. It stops when Vite exits. A change to Go code needs `pnpm dev` restarted; the page's own changes reload through Vite.
- **The page.** A Vite SPA. It starts one `POST /api/me` as the module loads and reads it with React's `use`, so a page load records one visit under StrictMode. "Visit again" calls it again in a transition. It renders nothing until the first answer, so the journeys' `getByRole("heading")` waits for the real one.
- **Production.** `dist/server` serves each file in `dist/public` and `index.html` for any other path, and refuses other methods than GET and HEAD on the page with 405. `start` is `./dist/server migrate && ./dist/server`, so the runtime is still `node --run start`. Every package is a dev dependency, so the image's production install adds nothing.
- **Migrations.** `migrations/*.sql`, embedded, applied in name order in one transaction that locks `schema_migrations`, so two containers starting together take turns. pgx sends a file with no arguments as one simple query, so a file may hold several statements.
- **The image.** The prune stage copies the app's `go.mod`, if any, to `out/go`. A `go` stage sees only that file: for a Go app it fetches Go 1.27.3 for `TARGETARCH` (amd64 or arm64), checks its SHA-256, and unpacks it; for any other app it leaves `/usr/local/go` empty. The build stage copies it in, with cache mounts for Go's modules and build cache.
- **Lint.** The install's `pnpm lint` is `robkit check && eslint . && turbo run lint`, so an app's own `lint` script runs; the Go app's is `gofmt -d .`, which exits 1 when it would change a file. The robkit module's lint is the same, which replaced a node script. lint-staged runs `gofmt -w` on staged Go files.
- **Go 1.27.3** in robkit's CI, the install's CI and the Dockerfile; `go.mod` asks for 1.26. A test checks the install's CI and Dockerfile name the same release.
- **`robkit check`** reads a Go file's strings, decoding Go's escapes, and skips comments and runes, so `"robkit\x5fsession"` is caught and `// "robkit_session"` isn't.

### Proof

- Red first: the stack lists on the old `choices.ts` (11 failed), the Go template's tests with the template moved away (29 failed), and each kit test before its change: the `go.mod` replace, vendor's copy, the missing-Go messages, the `.go` scan, and the Dockerfile, CI and lint tests.
- `go test ./...` on the module: 121 tests and subtests pass, the conformance cases among them; `guard` covers 100% of statements and `session` 94.4%. The template's own `go test` passes 4 tests.
- WSL, `go.test.ts`, `express.test.ts` and `install-checks.test.ts`: 31 passed, 1 skipped (the server-function journey on Express). The Go install ran every journey, the server-function journey and Ctrl-C included, and every install passed its own CI workflow.
- WSL, `pnpm --filter @internal/e2e test:production`: 12 passed, including the Go app over https and its image's extra-packages check.
- A linked `--stack go` install on Windows passed `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
- `pnpm check` on Windows passed but for 3 tests in `vendor.test.ts` that fail on Windows on the base branch too.
- CI on eb375a6 ([PR 71](https://github.com/RobertScholey98/robkit/pull/71)): `check` passed in 10 minutes 3 seconds, with the coverage ratchet after create-robkit's and dev's thresholds were raised to its measurement, `production` in 3 minutes 13 seconds, and `pull-request` and `gate` passed. [Run 42392338957](https://github.com/RobertScholey98/robkit/actions/runs/42392338957).

### Not verified

- `pnpm dev` by hand in a browser, outside the whole-stack test.
- A Go image on arm64: only amd64 built.
- An install neither linked nor vendored. Its Go app can't build until the module is published, which needs a version tag and waits for robkit's release flow.

### For other tickets

- **Ticket 02 (Next):** the rebase touches `stacks` in `src/choices.ts` (Go moved above Next, with two new fields), the stack-listing tests (`choices`, `usage`, `wizard`, `add-wizard`, `create-robkit-command`), `serverOn` in `generate.test.ts` (was `viewerOn`; each row now names how the server reads core's URL), create-robkit's API report and README, `docs/architecture.md`, `docs/testing.md`, the root README's package table, the map, and `install-journeys.ts`'s `serverFunction` comment.
- With Next ready after Go, the cycle becomes start → react-hono → express → go → next → start.
- A stack whose server isn't Node: follow the note under "Add a stack" in create-robkit's README.
- Contributors and CI need Go on the `PATH` for `pnpm check`; CONTRIBUTING says so.
- Go was installed on R's Windows machine in user space, at `C:\Users\rober\sdk\go` (1.27.3), and not added to the system `PATH`. WSL has it at `~/sdk/go`.
