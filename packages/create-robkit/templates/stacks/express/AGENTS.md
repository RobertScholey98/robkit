# This app

A React app on an Express server in a robkit install. Its folder name is its slug: it answers on `<slug>.<domain>`, which is `<slug>.robkit.localhost:3000` under `pnpm dev`, and its Postgres role and schema share the name. The install's root `AGENTS.md` states the layer rule, and `pnpm lint` checks it.

## The viewer

`src/server.tsx` is the Express app. Its first middleware is `guarded` from `@robkit/express`, and then it mounts the app's routes from `src/routes.tsx`, which render React to HTML. Before any handler runs, the guard checks the session and this app's access rule, and sends anyone who may not open the app to sign in. Handlers read who is asking as `res.locals.viewer`, typed by `GuardedResponse`:

```tsx
app.get("/", (req, res: GuardedResponse) => {
  const { viewer } = res.locals;
  // ...
});
```

A viewer is `{ kind: "owner", id }`, `{ kind: "guest", id, roles }`, or `{ kind: "nobody" }` in an app open to anyone. Key a viewer's data by `viewer.id`. Never read the session cookie or verify the token yourself. The token is the app's own: core mints it for this app's slug, and no other app or core accepts it. Paths under `/_robkit/` are the guard's, so give no route one.

The guard never reads a request's body, so put a body parser such as `express.json()` after it, on the routes that need it.

A call from the browser that isn't a page load, and whose session has lapsed, gets a 401 rather than a redirect. Make such calls with `sessionFetch` from `@robkit/react`, which sends the browser through core's refresh and back to the page.

## Changing state

A browser sends this app's cookie with a form posted from any app beside it, since they share a domain. So the guard refuses a write from another origin with a 403 before any handler runs. A write is any request but a GET, HEAD or OPTIONS. The guard can't protect a GET, which a link or an image on another app can send, so change state only on POST, PUT, PATCH or DELETE. Record nothing in an `app.get` handler.

Node hands a WebSocket upgrade to the HTTP server's `upgrade` event, not to Express, so the guard never sees one. If you add a WebSocket, check its `Origin` against this app's own origin before you accept it.

## Who may frame it

The guard sends `X-Frame-Options: SAMEORIGIN` with every answer it lets through, so only this app's own pages can put it in a frame. A frame from any app beside it would carry the viewer's cookies. To let another origin frame a page, such as the hub, send `Content-Security-Policy: frame-ancestors 'self' https://hub.<domain>` with it, and a browser follows that instead. To refuse every framer, this app included, send `frame-ancestors 'none'`.

Set it in the handler, with `res.set("Content-Security-Policy", ...)`, or in middleware after `guarded`. Don't set `X-Frame-Options` yourself. Use `frame-ancestors`, which works the same on every stack.

## Serving

- `pnpm dev` runs Vite. `expressApp()` from `@robkit/vite/express`, in `vite.config.ts`, hands every request Vite doesn't answer itself to the Express app in `src/server.tsx`, which it loads afresh after each change. Don't listen in `src/server.tsx`.
- `pnpm build` builds `src/serve.ts` into `dist/serve.js`, and the stylesheet the page links into `dist/assets`. `robkit({ serve: "src/serve.ts" })` in `vite.config.ts` sets that layout, so the config has no `build` block. Leave out `build.ssr`, `build.outDir` and `build.ssrEmitAssets`: another value stops the build with a message that names the setting. The production image runs the `start` script, which migrates and then runs it.
- `src/serve.ts` calls `serve(server)` from `@robkit/express/serve`. It listens on `HOST` and `PORT`, answers `dist/assets` under `/assets` and this app's `public` folder at the root, hands every other request to the app, and stops on SIGTERM. It returns the Node server, so a WebSocket server can attach to it. Put code of your own before the call.
- Built files are public. `serve` answers `dist/assets`, and every file in `public`, before the guard runs, so put nothing there that a viewer shouldn't see.
- `dependencies` are what the server imports when it runs. The production image installs only those, so a package the server needs that sits in `devDependencies` is missing there.

## Testing

`pnpm test` runs Vitest, which loads `vite.config.ts` as `pnpm dev` does. A test needs no database, no core and no `pnpm dev`. A test runs with no `pnpm dev` behind it, so the app's `.env` doesn't reach `process.env`. A test that needs a setting sets it, with `vi.stubEnv`. `src/routes.test.tsx` shows the pattern:

- It mounts `routes(...)` behind `guardedAs(viewer)` from `@robkit/express/testing` instead of `guarded()`, so every request is that viewer's. `owner()`, `guest({ roles: ["family"] })` and `nobody()`, from the same entry, build the viewer.
- It passes the routes a stand-in for what they store through, so nothing reaches Postgres. Give a new route what it stores the same way, as an argument to `routes`.
- It imports `src/routes.tsx`, never `src/server.tsx`. `guarded()` reads its settings as the server loads, and stops the run when one is missing.

`guardedAs` serves only in a test run. In the app's image, under `pnpm dev` and in a server started by hand it refuses every request, so it never stands in for the guard in a server.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `process.env.ROBKIT_CORE_URL`. Never import `@robkit/core`.

## Environment

The guard reads `ROBKIT_APP` and `ROBKIT_CORE_URL` itself, so `guarded()` takes no settings. When one is missing or won't do, it prints what to fix and stops the app. Don't read them for the guard yourself.

`vite.config.ts` calls `robkit()` from `@robkit/vite` first, which sets the dev server up for `pnpm dev`: it listens on `PORT`, answers `<slug>.<domain>`, and stops the dev server as it starts, with the same message, when `ROBKIT_APP` or `ROBKIT_CORE_URL` is missing. It changes nothing under Vitest, and for a build it sets only the layout `serve` names. The rest of the config, such as Tailwind, is the app's own.

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.

The app's own settings, such as an API key, go in its `.env`, which git ignores. `pnpm dev` loads it for this app alone as it starts, so an edit waits for the next `pnpm dev`. Commit an `.env.example` that names each setting. The install's `AGENTS.md` says what the file can't set, and where the settings go in production. Vite writes a `VITE_*` value into the page when it builds the app, and Docker builds an image without the `.env`, so in production the page doesn't have it. Read the setting on the server and hand it to the page instead.

The example's queries are in `src/visits.ts`. The server hands them to `routes(visits)` in `src/routes.tsx`.

## The database

The app talks to Postgres with Drizzle over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares the tables. Use `pgTable`, never `pgSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database with `appDatabase(schema)` from `@robkit/drizzle`, which connects on first use. `src/visits.ts` shows a query.
- `drizzle/` holds the migrations. After changing `src/schema.ts`, run `pnpm db:generate` to write the next one, and commit it. Never edit a migration that has run. With `pnpm dev` running, run `pnpm robkit migrate <slug>` in the install's folder to apply it without a restart. The app keeps its connection and its password.

The `migrate` script runs `robkit-migrate`, from `@robkit/drizzle`, which applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It keeps its journal table in the app's schema, and two containers that start together apply each migration once. If you set `out` in `drizzle.config.ts` to another folder, name it in the script: `robkit-migrate <folder>`.

## Upgrading robkit

`pnpm robkit upgrade` moves the `@robkit/*` packages this app runs on to a newer version, and never rewrites a file in this folder. When a new robkit changes what an app should hold, the changelog it prints says what to change here by hand.
