# This app

A React app on a Hono server in a robkit install. Its folder name is its slug: it answers on `<slug>.<domain>`, which is `<slug>.robkit.localhost:3000` under `pnpm dev`, and its Postgres role and schema share the name. The install's root `AGENTS.md` states the layer rule, and `pnpm lint` checks it.

## The viewer

`src/server.tsx` is the Hono server, and it renders React to HTML. Its first middleware is `guarded` from `@robkit/hono`. Before any handler runs, the guard checks the session and this app's access rule, and sends anyone who may not open the app to sign in. Handlers read who is asking as `c.var.viewer`:

```tsx
app.get("/", (c) => {
  const { viewer } = c.var;
  // ...
});
```

A viewer is `{ kind: "owner", id }`, `{ kind: "guest", id, roles }`, or `{ kind: "nobody" }` in an app open to anyone. Key a viewer's data by `viewer.id`. Never read the session cookie or verify the token yourself. The token is the app's own: core mints it for this app's slug, and no other app or core accepts it. Paths under `/_robkit/` are the guard's, so give no route one.

A call from the browser that isn't a page load, and whose session has lapsed, gets a 401 rather than a redirect. Make such calls with `sessionFetch` from `@robkit/react`, which sends the browser through core's refresh and back to the page.

## Changing state

A browser sends this app's cookie with a form posted from any app beside it, since they share a domain. So the guard refuses a write from another origin with a 403 before any handler runs. A write is any request but a GET, HEAD or OPTIONS. The guard can't protect a GET, which a link or an image on another app can send, so change state only on POST, PUT, PATCH or DELETE. Record nothing in a `app.get` handler.

A WebSocket the server upgrades outside Hono's middleware never reaches the guard. If you add one, check its `Origin` against this app's own origin before you accept it.

## Who may frame it

The guard sends `X-Frame-Options: SAMEORIGIN` with every answer it lets through, so only this app's own pages can put it in a frame. A frame from any app beside it would carry the viewer's cookies. To let another origin frame a page, such as the hub, send `Content-Security-Policy: frame-ancestors 'self' https://hub.<domain>` with it, and a browser follows that instead. To refuse every framer, this app included, send `frame-ancestors 'none'`.

Set it in the handler, with `c.header("Content-Security-Policy", ...)`, or in middleware after `guarded`. Don't set `X-Frame-Options` yourself. Use `frame-ancestors`, which works the same on every stack.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `process.env.ROBKIT_CORE_URL`. Never import `@robkit/core`.

## Environment

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.

The example's queries are in `src/visits.ts`, and its `/` handler in `src/server.tsx` calls them.

## The database

The app talks to Postgres with Drizzle over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares the tables. Use `pgTable`, never `pgSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database, connected on first use. `src/visits.ts` shows a query.
- `drizzle/` holds the migrations. After changing `src/schema.ts`, run `pnpm db:generate` to write the next one, and commit it. Never edit a migration that has run.

`src/migrate.ts` applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It follows Drizzle's migrator but skips its `CREATE SCHEMA`, which the app's role may not run, and keeps its journal table in the app's schema.
