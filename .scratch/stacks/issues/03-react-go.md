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

**Status:** ready-for-agent

- [ ] The Go module passes the guard's conformance cases and the request guard's contract, under `go test` in the gate
- [ ] init `--stack go` and `robkit add --stack go` make a working app, and both wizards offer it
- [ ] The app owns its migrations, and the ORM layer doesn't apply to it
- [ ] `robkit check` scans Go files for the session cookie
- [ ] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [ ] The whole-stack journeys pass for a Go install in the pull-request gate
- [ ] The production test serves a Go app over https
- [ ] A missing Go toolchain gets a message that says how to install it
- [ ] The PR's CI `gate` job passes on GitHub
