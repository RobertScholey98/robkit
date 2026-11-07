# This app

A Next.js app, on the App Router, in a robkit install. Its folder name is its slug: it answers on `<slug>.<domain>`, which is `<slug>.robkit.localhost:3000` under `pnpm dev`, and its Postgres role and schema share the name. The install's root `AGENTS.md` states the layer rule, and `pnpm lint` checks it.

This is Next.js 16. Its docs for the installed version are in `node_modules/next/dist/docs/`. Read the relevant one before using an API you know from an older version: what runs before every request is `src/proxy.ts` now, for one.

## The viewer

`src/proxy.ts` exports `guarded` from `@robkit/next` as Next's proxy, which runs on Node before every page, route handler and server action. The guard checks the session and this app's access rule, and sends anyone who may not open the app to sign in. Server components, route handlers and server actions read who is asking as `await viewer()`:

```tsx
import { viewer } from "@robkit/next";

export default async function Page() {
  const asking = await viewer();
  // ...
}
```

A viewer is `{ kind: "owner", id }`, `{ kind: "guest", id, roles }`, or `{ kind: "nobody" }` in an app open to anyone. Key a viewer's data by `viewer.id`. Never read the session cookie or verify the token yourself. The token is the app's own: core mints it for this app's slug, and no other app or core accepts it. Paths under `/_robkit/` are the guard's, so give no route one.

The proxy passes the viewer on in a request header, with a key a client can't know. `viewer()` throws on a request the proxy didn't guard, so keep the matcher in `src/proxy.ts` covering every path but Next's own files. Client components can't call `viewer()`: pass what they need down as props, or call a server action.

A session can lapse while the page is open. A client navigation then loads the next page in full, and a server action sends the browser where the guard says. Either way the browser goes through core's refresh, or to the hub to sign in, and comes back to the page. A route handler the page calls with `fetch` gets a 401 instead: call it with `sessionFetch` from `@robkit/react`, which does the same.

## Serving

- `pnpm dev` runs `next dev` on the port `pnpm dev` assigns. `next.config.ts` lets the dev proxy's host reach Next's dev server, and turns Next's telemetry off.
- `pnpm build` runs `next build`, which writes the build to `dist`.
- The production image runs the `start` script, which migrates and then runs `src/serve.ts`. It serves the build with Next's request handler on `HOST` and `PORT`.
- `dependencies` are what runs in production: Next, React, and what `src/serve.ts` and `src/migrate.ts` import. The production image installs only those. `next build` bundles everything else the pages and the proxy import, `@robkit/next` and the UI kit among them, so those are dev dependencies.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `process.env.ROBKIT_CORE_URL`. Never import `@robkit/core`.

## Environment

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.

The example's queries are in `src/visits.ts`. `src/app/page.tsx` records a visit as it renders, `src/app/actions.ts` records another from a server action, and `src/app/visits/page.tsx` lists the latest.

## The database

The app talks to Postgres with Drizzle over `DATABASE_URL`, as its own role. The role has the app's own schema first on its search path, so a table named without a schema lands there. The role can't reach core's schema or another app's.

- `src/schema.ts` declares the tables. Use `pgTable`, never `pgSchema`: the app's schema is the role's, and naming another one fails.
- `src/database.ts` gives queries the database, connected on first use. `src/visits.ts` shows a query.
- `drizzle/` holds the migrations. After changing `src/schema.ts`, run `pnpm db:generate` to write the next one, and commit it. Never edit a migration that has run.

`src/migrate.ts` applies the migrations that haven't run yet. `pnpm dev`, and the app's container as it starts, run it after the app's schema and role exist and before the app serves. It follows Drizzle's migrator but skips its `CREATE SCHEMA`, which the app's role may not run, and keeps its journal table in the app's schema.
