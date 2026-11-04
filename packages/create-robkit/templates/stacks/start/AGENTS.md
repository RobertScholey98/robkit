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

A viewer is `{ kind: "owner", id }`, `{ kind: "guest", id, roles }`, or `{ kind: "nobody" }` in an app open to anyone. Key a viewer's data by `viewer.id`. Never read the session cookie or verify the token yourself.

`src/start.ts` hands server functions `sessionFetch` from `@robkit/react`. A call made after the session lapses goes through core's refresh and comes back to the page, rather than failing.

## Calling core

The guard already asks core for what it needs: core's public key and this app's access rule. The owner sets who may open the app in admin. The `robkit` field in `package.json` is only the rule core starts from. If the app needs more from core, call it over HTTP from the server at `process.env.ROBKIT_CORE_URL`. Never import `@robkit/core`.

## Environment

- `ROBKIT_APP` is the app's slug.
- `ROBKIT_CORE_URL` is core's origin.
- `DATABASE_URL` connects as the app's own Postgres role. Only an app with a `migrate` script gets one.

The example's queries are in `src/visits.ts`, and `src/routes/index.tsx` calls them from a server function.
