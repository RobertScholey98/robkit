# This app

A TanStack Start app in a robkit install. Its folder name is its slug: it answers on `<slug>.<domain>`, which is `<slug>.robkit.localhost:3000` under `pnpm dev`, and its Postgres role and schema share the name. The install's root `AGENTS.md` states the layer rule, and `pnpm lint` checks it.

## The viewer

`src/server.ts` wraps Start's server entry in `guarded` from `@robkit/start`. Before any route or server function runs, the guard checks the session and this app's access rule, and sends anyone who may not open the app to sign in. Routes and server functions read who is asking as `context.viewer`:

```ts
const visit = createServerFn({ method: "POST" }).handler(({ context }) => {
  const { viewer } = context;
  // ...
});
```

The `declare module` block in `src/server.ts` tells Start's types that `context` holds the viewer. Start reads it only from that file, so keep it there.

A viewer is `{ kind: "owner", id }`, `{ kind: "guest", id, roles }`, or `{ kind: "nobody" }` in an app open to anyone. Key a viewer's data by `viewer.id`. Never read the session cookie or verify the token yourself. The token is the app's own: core mints it for this app's slug, and no other app or core accepts it. Paths under `/_robkit/` are the guard's, so give no route one.

`src/start.ts` hands server functions `sessionFetch` from `@robkit/react`. A call made after the session lapses goes through core's refresh and comes back to the page, rather than failing.

## Changing state

A browser sends this app's cookie with a form posted from any app beside it, since they share a domain. So the guard refuses a write from another origin with a 403 before any handler runs. A write is any request but a GET, HEAD or OPTIONS. The guard can't protect a GET, which a link or an image on another app can send, so change state only on POST, PUT, PATCH or DELETE.

`createServerFn()` is a GET unless told otherwise, so every server function that changes state must say `method: "POST"`. A route's loader runs on the server during the page's GET, whatever method the server function it calls declares, so never change state from a loader.

The guard wraps Start's `fetch`, and a WebSocket the server upgrades outside it never reaches the guard. If you add one, check its `Origin` against this app's own origin before you accept it.

## Who may frame it

The guard sends `X-Frame-Options: SAMEORIGIN` with every answer it lets through, so only this app's own pages can put it in a frame. A frame from any app beside it would carry the viewer's cookies. To let another origin frame a page, such as the hub, send `Content-Security-Policy: frame-ancestors 'self' https://hub.<domain>` with it, and a browser follows that instead. To refuse every framer, this app included, send `frame-ancestors 'none'`.

Set it on the answer with `setResponseHeader("Content-Security-Policy", ...)` from `@tanstack/react-start/server`. Don't set `X-Frame-Options` yourself. Use `frame-ancestors`, which works the same on every stack.

## Testing

`pnpm test` runs Vitest, which loads `vite.config.ts` as `pnpm dev` does, and needs no database, no core and no `pnpm dev`. A server function runs only through Start's compiler and request handler, so a test calls what its handler calls instead. `src/home.test.tsx` shows the pattern:

- Each server function's handler hands `context.viewer` to a plain function, as `src/routes/index.tsx` hands it to `shownTo` and `visitAgainAs` in `src/visits.ts`.
- The test calls that function with a viewer from `@robkit/start/testing`: `owner()`, `guest({ roles: ["family"] })` or `nobody()`.
- The function takes what it stores through as an argument, so the test passes a stand-in and nothing reaches Postgres.
- The page's card is `HomeCard` in `src/home.tsx`, which takes what to show as props, so the test renders it with `renderToStaticMarkup`.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `process.env.ROBKIT_CORE_URL`. Never import `@robkit/core`.

## Environment

The guard reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself, so `guarded(entry)` takes no settings. When one is missing or won't do, it prints what to fix and stops the app. Don't read them for the guard yourself.

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.

The example's queries are in `src/visits.ts`. `src/routes/index.tsx` reads the count from its loader with a GET server function, and records a visit with a POST one when the button is pressed.

## The database

The app talks to Postgres with Drizzle over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares the tables. Use `pgTable`, never `pgSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database with `appDatabase(schema)` from `@robkit/drizzle`, which connects on first use. `src/visits.ts` shows a query.
- `drizzle/` holds the migrations. After changing `src/schema.ts`, run `pnpm db:generate` to write the next one, and commit it. Never edit a migration that has run.

The `migrate` script runs `robkit-migrate`, from `@robkit/drizzle`, which applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It keeps its journal table in the app's schema, and two containers that start together apply each migration once. If you set `out` in `drizzle.config.ts` to another folder, name it in the script: `robkit-migrate <folder>`.
