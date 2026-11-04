# 11: First hosted install

**What to build:** An install generated on the default choices deploys to robkit.dev using R's Coolify method: each app in its own container, provisioning and migrate commands as pre-deploy steps, and `ROBKIT_DOMAIN` set to robkit.dev. The owner claims the install through the first-run setup screen, mints a code, and a guest signs in with it on the hub and opens an app on its subdomain over HTTPS. This comes before the other ORMs, package managers and kits so they build on a Dockerfile, env and migrate setup that has already met production. Time-box it, and move what doesn't fit into follow-up tickets.

**Blocked by:** 10, 23, 28

**Status:** ready-for-agent

- [ ] Core, hub, admin and the example app are each live on their robkit.dev subdomain
- [ ] The owner claims the fresh install on first visit, and the setup screen is gone afterwards
- [ ] An app added with `robkit add` after the first deploy is live after its next deploy
- [ ] The `test` code is refused on the hosted install
- [ ] How a generated app's Dockerfile, env, provision and migrate steps plug into Coolify is written down for tickets 13, 14 and 18 to follow
- [ ] Problems found are fixed in the kit or listed in follow-up tickets

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 02 to 09, which were deleted once done:

- **Env.** Set `ROBKIT_CORE_URL` to core's public https origin, `ROBKIT_APP` on each app, and `ROBKIT_APPS` on core. `ROBKIT_DOMAIN` is required by core. (03, 04, 06)
- **Core's network.** Core listens on 127.0.0.1 unless `HOST` is set, because its sign-in limit trusts `X-Forwarded-For`. The container must set `HOST=0.0.0.0` and keep core's port off the public network. (03)
- **Production servers.** The Start app runs under `vite dev` only, and needs a production server for `dist/server/server.js`. The react-hono example has no production build yet. (04, 07)
- **First boot.** Core needs a migrated database to boot. On an unmigrated one it exits 1 with a raw Drizzle error. A friendlier message is still to do. (03)
- **Published packages.** `@robkit/*` export `.ts` source, which Node won't strip under `node_modules`, and the generator reads the catalog from the checkout it runs from. A deploy that doesn't link a checkout needs built packages and a catalog shipped in `create-robkit`. (02, 08)

Notes from ticket 10:

- **Role passwords (R, 2026-11-03).** In production each app's role password is derived from one install secret, `ROBKIT_DB_SECRET`, held only by the provision step: an HMAC of the slug. robkit prints each app's `DATABASE_URL` so the owner sets it once on the host. The provision step today sets a fresh random password on every run, which is right for local dev only; this ticket adds the derived one.
- **`ROBKIT_APPS` is JSON now.** Core reads a JSON list of `{ slug, access?, icon? }`, each app's manifest from the `robkit` field of its `package.json`. `catalogOf(await discoverApps(root))` in `@robkit/dev` builds it. Core refuses to start on one it can't read.
- **`robkit add` in an install** is `pnpm robkit add`, from `create-robkit` as a dev dependency. An app it adds after the first deploy needs its container, its `DATABASE_URL`, a provision run, and core restarted with the new `ROBKIT_APPS`.

Notes from ticket 12:

- **Builds.** The install's CI runs `pnpm build` (`turbo run build`), but only the hub has a `build` script. Give core, admin and each stack template one as this ticket adds their production servers, and CI builds them for free.
