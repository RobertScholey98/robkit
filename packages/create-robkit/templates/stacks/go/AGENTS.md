# This app

A React page on a Go server in a robkit install. Its folder name is its slug: it answers on `<slug>.<domain>`, which is `<slug>.robkit.localhost:3000` under `pnpm dev`, and its Postgres role and schema share the name. The install's root `AGENTS.md` states the layer rule, and `pnpm lint` checks it. Building and running the app needs Go 1.26 or later on your `PATH`.

## The viewer

`server.go` is the server. `session.Guarded`, from robkit's Go module `github.com/RobertScholey98/robkit/go`, wraps every handler, the page's included. Before any handler runs, the guard checks the session and this app's access rule, and sends anyone who may not open the app to sign in. Handlers read who is asking as `session.ViewerFrom(r.Context())`, and switch on its type:

```go
switch viewer := session.ViewerFrom(r.Context()).(type) {
case guard.Owner:
	// viewer.ID
case guard.Guest:
	// viewer.ID, the guest's code's id, and viewer.Roles
case guard.Nobody:
	// someone not signed in, in an app open to anyone
}
```

Key a viewer's data by its id. Never read the session cookie or verify the token yourself. The token is the app's own: core mints it for this app's slug, and no other app or core accepts it. Paths under `/_robkit/` are the guard's, so give no route one. To test a handler, hand it a viewer with `session.WithViewer`, as `server_test.go` does.

The page is React, in `src/main.tsx`. It asks the server who is asking with `sessionFetch` from `@robkit/react`. A call from the page whose session has lapsed gets a 401 rather than a redirect, and `sessionFetch` sends the browser through core's refresh and back to the page. Make every call from the page to the app with it.

## Changing state

A browser sends this app's cookie with a form posted from any app beside it, since they share a domain. So the guard refuses a write from another origin with a 403 before any handler runs. A write is any request but a GET, HEAD or OPTIONS. The guard can't protect a GET, which a link or an image on another app can send, so change state only on POST, PUT, PATCH or DELETE.

Every request reaches the guard, WebSocket handshakes included. It lets a handshake through only when its `Origin` is this app's own, which is how Vite's hot updates pass under `pnpm dev`.

## Serving

- `pnpm dev` runs `go run . dev`. The Go server listens on `PORT` and guards everything, as in production. It starts Vite on a port of its own and passes it every request beyond the API: the page, its modules, and Vite's hot updates over a WebSocket. Restart `pnpm dev` after changing Go code; Vite reloads the page's own changes.
- `pnpm build` runs `vite build`, which writes the page to `dist/public`, then `go build`, which writes the server to `dist/server`. The built server serves each file in `dist/public` and `index.html` for any other path, so the page can have routes of its own.
- The production image runs the `start` script, which migrates and then serves. The image runs the binary alone, so the server needs nothing from `node_modules`, and the page's packages are all `devDependencies`.
- `pnpm lint` runs `gofmt -d .`, `pnpm typecheck` runs `go vet` and `tsc`, and `pnpm test` runs `go test`.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `os.Getenv("ROBKIT_CORE_URL")`. Never import `@robkit/core`.

## Environment

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.
- `HOST` and `PORT` are where the server listens, by default `127.0.0.1:3000`.

## The database

The app owns its database code: it talks to Postgres with pgx over `DATABASE_URL`, as its own role, in plain SQL. robkit's Drizzle files, which the install's Node apps use, don't apply to it. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `migrations/` holds the migrations, one `.sql` file each, applied in name order. To change the schema, add the next file, such as `0002_add_notes.sql`, and commit it. Never edit a migration that has run.
- `visits.go` shows a query. `server.go` connects with `pgxpool` as the server starts.

`migrate.go` applies the migrations that haven't run yet, and records each in the `schema_migrations` table. They are embedded in the binary, so `dist/server migrate` needs no files beside it. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves.
